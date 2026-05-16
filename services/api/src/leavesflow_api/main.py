from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .ai import AIClient
from .auth import get_current_user_id
from .bootstrap import create_tables, seed_demo_data
from .config import Settings, get_settings
from .database import SessionLocal, get_db
from .errors import AppError, error_response
from .models import Goal, SkillTag, TaskCheckIn, TaskNode
from .schemas import (
    CheckInRequest,
    CheckInResponse,
    CreateGoalRequest,
    CreateGoalResponse,
    GeneratePlanRequest,
    GoalDetailResponse,
    MeResponse,
    PlanResponse,
    SkillTagOut,
    TagOptionsResponse,
    UpdateTagProfileResponse,
    UserTagProfileIds,
)
from .services import (
    current_profile_ids,
    current_profile_out,
    list_tag_options,
    merge_skill_tags,
    persist_plan,
    plan_to_response,
    profile_ids_to_out,
    tag_context_for_profile,
    update_profile,
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


@app.get("/api/v1/tag-options", response_model=TagOptionsResponse)
def get_tag_options(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> TagOptionsResponse:
    return TagOptionsResponse(categories=list_tag_options(db))


@app.get("/api/v1/me", response_model=MeResponse)
def get_me(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> MeResponse:
    skill_rows = db.scalars(
        select(SkillTag).where(SkillTag.user_id == user_id).order_by(SkillTag.updated_at.desc())
    ).all()
    return MeResponse(
        userId=user_id,
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
    )


@app.put("/api/v1/me/tag-profile", response_model=UpdateTagProfileResponse)
def put_tag_profile(
    payload: UserTagProfileIds,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> UpdateTagProfileResponse:
    return UpdateTagProfileResponse(tagProfile=update_profile(db, user_id, payload))


@app.post("/api/v1/goals", response_model=CreateGoalResponse, status_code=201)
def create_goal(
    payload: CreateGoalRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> CreateGoalResponse:
    profile_ids = payload.profileSnapshot or current_profile_ids(db, user_id)
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
    result = ai.generate_plan(goal.raw_input, tag_context_for_profile(db, profile_ids))
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
    extraction = AIClient(settings).extract_skills(ai_payload)

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
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "CONFLICT", "该任务已经打卡完成") from exc
    return CheckInResponse(checkInId=check_in.id, taskNodeId=task.id, newSkillTags=skills)
