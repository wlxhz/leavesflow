from __future__ import annotations

import uuid
import hashlib
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .ai import AIClient
from .auth import get_current_user_id
from .admin import router as admin_router
from .bootstrap import create_tables, seed_demo_data
from .config import Settings, get_settings
from .database import SessionLocal, get_db
from .errors import AppError, error_response
from .models import Goal, SkillTag, TaskCheckIn, TaskNode, User
from .schemas import (
    ActivePlanResponse,
    AuthResponse,
    CheckInRequest,
    CheckInResponse,
    CreateGoalRequest,
    CreateGoalResponse,
    GeneratePlanRequest,
    GoalDetailResponse,
    GoalHistoryItem,
    LoginRequest,
    MeResponse,
    PlanResponse,
    RegisterRequest,
    SkillTagOut,
    TagOptionsResponse,
    UpdateMeRequest,
    UpdateTagProfileResponse,
    UserOut,
    UserTagProfileIds,
)
from .services import (
    current_active_plan,
    goal_history_items,
    current_profile_ids,
    current_profile_out,
    list_tag_options,
    mark_goal_completed_if_needed,
    merge_skill_tags,
    persist_plan,
    plan_to_response,
    profile_ids_to_out,
    record_ai_usage,
    tag_context_for_profile,
    update_profile,
    validate_required_profile_ids,
)
from .utils import dumps_json, loads_json, new_id, utc_now


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    with SessionLocal() as db:
        seed_demo_data(db)
    yield


app = FastAPI(
    title="LeavesFlow API",
    version="0.1.0",
    description="LeavesFlow MVP V1 API",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request.state.request_id = str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-Id"] = request.state.request_id
    return response


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return error_response(request, exc.status_code, exc.code, exc.message, exc.details)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    fields: dict[str, list[str]] = {}
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", []) if part != "body")
        fields.setdefault(loc or "body", []).append(err.get("msg", "参数不合法"))
    return error_response(request, 400, "VALIDATION_ERROR", "请求参数不符合要求", {"fields": fields})


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _hash_password(password: str, salt: str | None = None) -> str:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), password_salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${password_salt}${digest.hex()}"


def _verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        algorithm, salt, expected = password_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    actual = _hash_password(password, salt).rsplit("$", 1)[1]
    return secrets.compare_digest(actual, expected)


def _new_auth_token() -> str:
    return f"lf_{secrets.token_urlsafe(32)}"


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username or "",
        displayName=user.display_name or user.username or "LeavesFlow 用户",
        createdAt=user.created_at,
    )


@app.post("/api/v1/auth/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    validate_required_profile_ids(db, payload.profile, ["identityTagIds", "backgroundTagIds", "levelTagIds"])
    if db.scalar(select(User.id).where(User.username == payload.username)):
        raise AppError(409, "CONFLICT", "用户名已被注册")
    now = utc_now()
    token = _new_auth_token()
    user = User(
        id=new_id(),
        username=payload.username,
        display_name=payload.displayName or payload.username,
        password_hash=_hash_password(payload.password),
        auth_token=token,
        created_at=now,
        updated_at=now,
    )
    try:
        db.add(user)
        profile = update_profile(db, user.id, payload.profile, commit=False)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "CONFLICT", "用户名已被注册") from exc
    except Exception:
        db.rollback()
        raise
    return AuthResponse(token=token, user=_user_out(user), tagProfile=profile)


@app.post("/api/v1/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not _verify_password(payload.password, user.password_hash):
        raise AppError(401, "UNAUTHORIZED", "用户名或密码错误")
    user.auth_token = _new_auth_token()
    user.updated_at = utc_now()
    db.commit()
    return AuthResponse(token=user.auth_token or "", user=_user_out(user), tagProfile=current_profile_out(db, user.id))


@app.get("/api/v1/tag-options", response_model=TagOptionsResponse)
def get_tag_options(
    db: Session = Depends(get_db),
) -> TagOptionsResponse:
    return TagOptionsResponse(categories=list_tag_options(db))


@app.get("/api/v1/me", response_model=MeResponse)
def get_me(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> MeResponse:
    user = db.get(User, user_id)
    if not user:
        raise AppError(401, "UNAUTHORIZED", "用户不存在")
    skill_rows = db.scalars(
        select(SkillTag).where(SkillTag.user_id == user_id).order_by(SkillTag.updated_at.desc())
    ).all()
    active_plan = current_active_plan(db, user_id)
    return MeResponse(
        userId=user_id,
        user=_user_out(user),
        tagProfile=current_profile_out(db, user_id),
        skillTags=[
            SkillTagOut(
                id=row.id,
                name=row.name,
                level=row.level,
                count=row.count,
                prompt=row.skill_prompt,
                sourceTaskId=row.source_task_id,
                sourceGoalId=row.source_goal_id,
                evidence=row.evidence,
                updatedAt=row.updated_at,
            )
            for row in skill_rows
        ],
        goalHistory=goal_history_items(db, user_id),
        activePlan=active_plan,
    )


@app.put("/api/v1/me", response_model=MeResponse)
def update_me(
    payload: UpdateMeRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> MeResponse:
    user = db.get(User, user_id)
    if not user:
        raise AppError(401, "UNAUTHORIZED", "用户不存在")
    user.display_name = payload.displayName.strip()
    user.updated_at = utc_now()
    db.commit()
    return get_me(user_id, db)


@app.put("/api/v1/me/tag-profile", response_model=UpdateTagProfileResponse)
def put_tag_profile(
    payload: UserTagProfileIds,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> UpdateTagProfileResponse:
    validate_required_profile_ids(db, payload, ["identityTagIds", "backgroundTagIds", "levelTagIds"])
    current = current_profile_ids(db, user_id)
    merged = UserTagProfileIds(
        identityTagIds=payload.identityTagIds,
        backgroundTagIds=payload.backgroundTagIds,
        levelTagIds=payload.levelTagIds,
        goalTypeTagIds=current.goalTypeTagIds,
        timeRangeTagIds=current.timeRangeTagIds,
        outputPreferenceTagIds=current.outputPreferenceTagIds,
    )
    return UpdateTagProfileResponse(tagProfile=update_profile(db, user_id, merged))


@app.post("/api/v1/goals", response_model=CreateGoalResponse, status_code=201)
def create_goal(
    payload: CreateGoalRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> CreateGoalResponse:
    base_profile = current_profile_ids(db, user_id)
    if payload.profileSnapshot:
        profile_ids = UserTagProfileIds(
            identityTagIds=base_profile.identityTagIds,
            backgroundTagIds=base_profile.backgroundTagIds,
            levelTagIds=base_profile.levelTagIds,
            goalTypeTagIds=payload.profileSnapshot.goalTypeTagIds,
            timeRangeTagIds=payload.profileSnapshot.timeRangeTagIds,
            outputPreferenceTagIds=payload.profileSnapshot.outputPreferenceTagIds,
        )
    else:
        profile_ids = base_profile
    validate_required_profile_ids(db, profile_ids, ["identityTagIds", "backgroundTagIds", "levelTagIds"])
    profile_out = profile_ids_to_out(db, profile_ids)
    now = utc_now()
    title = payload.rawInput.strip()[:80]
    goal = Goal(
        id=new_id(),
        user_id=user_id,
        title=title,
        raw_input=payload.rawInput.strip(),
        profile_snapshot=dumps_json(profile_ids.model_dump()),
        status="active",
        goal_summary=None,
        created_at=now,
        updated_at=now,
    )
    db.add(goal)
    db.commit()
    return CreateGoalResponse(
        id=goal.id,
        title=goal.title,
        rawInput=goal.raw_input,
        status=goal.status,
        profileSnapshot=profile_out,
        createdAt=goal.created_at,
    )


@app.post("/api/v1/goals/{goal_id}/plan:generate", response_model=PlanResponse)
def generate_plan(
    goal_id: str,
    payload: GeneratePlanRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    goal = db.get(Goal, goal_id)
    if not goal or goal.user_id != user_id:
        raise AppError(404, "NOT_FOUND", "目标不存在")
    profile_ids = UserTagProfileIds.model_validate_json(goal.profile_snapshot)
    ai = AIClient(settings)
    try:
        result = ai.generate_plan(goal.raw_input, tag_context_for_profile(db, profile_ids))
    except AppError as exc:
        record_ai_usage(
            db,
            user_id=user_id,
            goal_id=goal.id,
            operation="generate_plan",
            model=ai.last_model,
            usage=ai.last_usage,
            status="failed",
            error_code=exc.code,
            error_message=exc.message,
            latency_ms=ai.last_latency_ms,
        )
        raise
    record_ai_usage(
        db,
        user_id=user_id,
        goal_id=goal.id,
        operation="generate_plan",
        model=ai.last_model,
        usage=ai.last_usage,
        status="success",
        latency_ms=ai.last_latency_ms,
    )
    return persist_plan(db, goal, result)


@app.get("/api/v1/goals/{goal_id}", response_model=GoalDetailResponse)
def get_goal(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> GoalDetailResponse:
    goal = db.get(Goal, goal_id)
    if not goal or goal.user_id != user_id:
        raise AppError(404, "NOT_FOUND", "目标不存在")
    profile_ids = UserTagProfileIds.model_validate_json(goal.profile_snapshot)
    return GoalDetailResponse(
        id=goal.id,
        title=goal.title,
        rawInput=goal.raw_input,
        status=goal.status,
        goalSummary=goal.goal_summary,
        profileSnapshot=profile_ids_to_out(db, profile_ids),
        createdAt=goal.created_at,
        plan=plan_to_response(db, goal),
    )


@app.get("/api/v1/goals/{goal_id}/plan", response_model=PlanResponse)
def get_plan(
    goal_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    goal = db.get(Goal, goal_id)
    if not goal or goal.user_id != user_id:
        raise AppError(404, "NOT_FOUND", "目标不存在")
    plan = plan_to_response(db, goal)
    if not plan:
        raise AppError(404, "NOT_FOUND", "任务路径尚未生成")
    return plan


@app.get("/api/v1/me/active-plan", response_model=ActivePlanResponse)
def get_active_plan(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> ActivePlanResponse:
    plan = current_active_plan(db, user_id)
    if not plan:
        raise AppError(404, "NOT_FOUND", "当前没有未完成任务路径")
    return plan


@app.post("/api/v1/tasks/{task_id}/check-ins", response_model=CheckInResponse, status_code=201)
def create_check_in(
    task_id: str,
    payload: CheckInRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> CheckInResponse:
    task = db.get(TaskNode, task_id)
    if not task:
        raise AppError(404, "NOT_FOUND", "任务不存在")
    goal = db.get(Goal, task.goal_id)
    if not goal or goal.user_id != user_id:
        raise AppError(404, "NOT_FOUND", "任务不存在")
    if task.status == "completed" or db.scalar(select(TaskCheckIn.id).where(TaskCheckIn.task_node_id == task_id)):
        raise AppError(409, "CONFLICT", "该任务已经打卡完成")

    profile_ids = UserTagProfileIds.model_validate_json(goal.profile_snapshot)
    ai_payload = {
        "tagProfile": profile_ids_to_out(db, profile_ids).model_dump(mode="json"),
        "selectedTagPrompts": tag_context_for_profile(db, profile_ids),
        "goal": {"id": goal.id, "title": goal.title, "rawInput": goal.raw_input, "goalSummary": goal.goal_summary},
        "task": {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "contextForAI": task.context_for_ai,
            "vibeCodingPrompt": task.vibe_coding_prompt,
            "expectedOutput": task.expected_output,
            "completionCriteria": loads_json(task.completion_criteria),
        },
        "checkIn": payload.model_dump(),
    }
    ai = AIClient(settings)
    try:
        extraction = ai.extract_skills(ai_payload)
    except AppError as exc:
        record_ai_usage(
            db,
            user_id=user_id,
            goal_id=goal.id,
            task_node_id=task.id,
            operation="extract_skills",
            model=ai.last_model,
            usage=ai.last_usage,
            status="failed",
            error_code=exc.code,
            error_message=exc.message,
            latency_ms=ai.last_latency_ms,
        )
        raise
    record_ai_usage(
        db,
        user_id=user_id,
        goal_id=goal.id,
        task_node_id=task.id,
        operation="extract_skills",
        model=ai.last_model,
        usage=ai.last_usage,
        status="success",
        latency_ms=ai.last_latency_ms,
    )

    now = utc_now()
    check_in = TaskCheckIn(
        id=new_id(),
        user_id=user_id,
        task_node_id=task.id,
        goal_id=goal.id,
        what_done=payload.whatDone,
        what_produced=payload.whatProduced,
        problems=payload.problems,
        created_at=now,
    )
    try:
        db.add(check_in)
        task.status = "completed"
        skills = merge_skill_tags(db, user_id, goal.id, task.id, extraction.newSkillTags)
        mark_goal_completed_if_needed(db, goal)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "CONFLICT", "该任务已经打卡完成") from exc
    return CheckInResponse(checkInId=check_in.id, taskNodeId=task.id, newSkillTags=skills)
