from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import get_db
from .errors import AppError
from .models import AIUsageLog, Goal, SkillTag, Stage, TaskCheckIn, TaskNode, User, UserDeletionLog, UserTagProfile
from .utils import new_id, utc_now


def require_admin_password(
    x_admin_password: str | None = Header(default=None, alias="X-Admin-Password"),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = settings.admin.access_password.strip()
    if not expected:
        raise AppError(503, "ADMIN_NOT_CONFIGURED", "后台访问密码未配置")
    if not x_admin_password or not secrets.compare_digest(x_admin_password, expected):
        raise AppError(401, "ADMIN_UNAUTHORIZED", "后台访问密码错误")


router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_password)],
)


class DeleteUserRequest(BaseModel):
    confirm: str = Field(min_length=1)
    mode: str = "hard"


class UpdateUserRequest(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=64)
    displayName: str | None = Field(default=None, max_length=80)


def _window_start(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat().replace("+00:00", "Z")


def _count(db: Session, stmt: Any) -> int:
    return int(db.scalar(stmt) or 0)


def _token_k(tokens: int | None) -> float:
    return round(float(tokens or 0) / 1000, 1)


def _token_sum(db: Session, *conditions: Any) -> int:
    stmt = select(func.coalesce(func.sum(AIUsageLog.total_tokens), 0))
    if conditions:
        stmt = stmt.where(*conditions)
    return int(db.scalar(stmt) or 0)


def _user_counts(db: Session, user_id: str) -> dict[str, int]:
    goal_ids = select(Goal.id).where(Goal.user_id == user_id)
    return {
        "goals": _count(db, select(func.count()).select_from(Goal).where(Goal.user_id == user_id)),
        "tasks": _count(db, select(func.count()).select_from(TaskNode).where(TaskNode.goal_id.in_(goal_ids))),
        "checkIns": _count(db, select(func.count()).select_from(TaskCheckIn).where(TaskCheckIn.user_id == user_id)),
        "skillTags": _count(db, select(func.count()).select_from(SkillTag).where(SkillTag.user_id == user_id)),
    }


def _user_token_usage(db: Session, user_id: str) -> dict[str, float]:
    one_day = _window_start(1)
    seven_days = _window_start(7)
    thirty_days = _window_start(30)
    return {
        "oneDayK": _token_k(_token_sum(db, AIUsageLog.user_id == user_id, AIUsageLog.created_at >= one_day)),
        "sevenDaysK": _token_k(_token_sum(db, AIUsageLog.user_id == user_id, AIUsageLog.created_at >= seven_days)),
        "thirtyDaysK": _token_k(_token_sum(db, AIUsageLog.user_id == user_id, AIUsageLog.created_at >= thirty_days)),
        "allRecordedK": _token_k(_token_sum(db, AIUsageLog.user_id == user_id)),
    }


def _user_summary(db: Session, user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username or "",
        "displayName": user.display_name or user.username or "",
        "createdAt": user.created_at,
        "updatedAt": user.updated_at,
        "counts": _user_counts(db, user.id),
        "tokenUsage": _user_token_usage(db, user.id),
    }


def _token_window(db: Session, start_at: str) -> dict[str, float]:
    return {
        "totalK": _token_k(_token_sum(db, AIUsageLog.created_at >= start_at)),
        "generatePlanK": _token_k(
            _token_sum(db, AIUsageLog.created_at >= start_at, AIUsageLog.operation == "generate_plan")
        ),
        "extractSkillsK": _token_k(
            _token_sum(db, AIUsageLog.created_at >= start_at, AIUsageLog.operation == "extract_skills")
        ),
    }


def _recent_goals(db: Session) -> list[dict[str, Any]]:
    goals = db.scalars(select(Goal).order_by(Goal.updated_at.desc()).limit(10)).all()
    rows: list[dict[str, Any]] = []
    for goal in goals:
        user = db.get(User, goal.user_id)
        total_tasks = _count(db, select(func.count()).select_from(TaskNode).where(TaskNode.goal_id == goal.id))
        completed_tasks = _count(
            db,
            select(func.count())
            .select_from(TaskNode)
            .where(TaskNode.goal_id == goal.id, TaskNode.status == "completed"),
        )
        rows.append(
            {
                "id": goal.id,
                "title": goal.title,
                "status": goal.status,
                "userId": goal.user_id,
                "username": user.username if user else "",
                "createdAt": goal.created_at,
                "updatedAt": goal.updated_at,
                "totalTasks": total_tasks,
                "completedTasks": completed_tasks,
            }
        )
    return rows


def _recent_check_ins(db: Session) -> list[dict[str, Any]]:
    check_ins = db.scalars(select(TaskCheckIn).order_by(TaskCheckIn.created_at.desc()).limit(10)).all()
    rows: list[dict[str, Any]] = []
    for check_in in check_ins:
        user = db.get(User, check_in.user_id)
        goal = db.get(Goal, check_in.goal_id)
        task = db.get(TaskNode, check_in.task_node_id)
        rows.append(
            {
                "id": check_in.id,
                "createdAt": check_in.created_at,
                "userId": check_in.user_id,
                "username": user.username if user else "",
                "goalId": check_in.goal_id,
                "goalTitle": goal.title if goal else "",
                "taskNodeId": check_in.task_node_id,
                "taskTitle": task.title if task else "",
            }
        )
    return rows


@router.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    one_day = _window_start(1)
    seven_days = _window_start(7)
    thirty_days = _window_start(30)

    def user_window(start_at: str) -> dict[str, int]:
        created = _count(db, select(func.count()).select_from(User).where(User.created_at >= start_at))
        deleted_count = _count(
            db,
            select(func.count()).select_from(UserDeletionLog).where(UserDeletionLog.deleted_at >= start_at),
        )
        return {"created": created, "deleted": deleted_count, "net": created - deleted_count}

    recent_users = db.scalars(select(User).order_by(User.created_at.desc()).limit(10)).all()
    return {
        "summary": {
            "totalUsers": _count(db, select(func.count()).select_from(User)),
            "totalGoals": _count(db, select(func.count()).select_from(Goal)),
            "totalTasks": _count(db, select(func.count()).select_from(TaskNode)),
            "totalCheckIns": _count(db, select(func.count()).select_from(TaskCheckIn)),
            "totalSkillTags": _count(db, select(func.count()).select_from(SkillTag)),
        },
        "userWindows": {
            "oneDay": user_window(one_day),
            "sevenDays": user_window(seven_days),
            "thirtyDays": user_window(thirty_days),
        },
        "tokenWindows": {
            "oneDay": _token_window(db, one_day),
            "sevenDays": _token_window(db, seven_days),
            "thirtyDays": _token_window(db, thirty_days),
        },
        "recentUsers": [_user_summary(db, user) for user in recent_users],
        "recentGoals": _recent_goals(db),
        "recentCheckIns": _recent_check_ins(db),
        "systemFeedback": {
            "aiBaseUrlConfigured": bool(settings.openai_compatible.base_url.strip()),
            "aiApiKeyConfigured": bool(settings.openai_compatible.api_key.strip()),
            "tokenUsageTrackingEnabled": True,
        },
    }


@router.get("/users/search")
def search_user(
    query: str = Query(min_length=1),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    needle = query.strip()
    user = db.get(User, needle)
    if not user:
        user = db.scalar(select(User).where(func.lower(User.username) == needle.lower()))
    if not user:
        raise AppError(404, "NOT_FOUND", "用户不存在")

    recent_usage = db.scalars(
        select(AIUsageLog).where(AIUsageLog.user_id == user.id).order_by(AIUsageLog.created_at.desc()).limit(10)
    ).all()
    return {
        "user": {
            "id": user.id,
            "username": user.username or "",
            "displayName": user.display_name or user.username or "",
            "createdAt": user.created_at,
            "updatedAt": user.updated_at,
        },
        "counts": _user_counts(db, user.id),
        "tokenUsage": _user_token_usage(db, user.id),
        "recentAiUsage": [
            {
                "id": row.id,
                "createdAt": row.created_at,
                "operation": row.operation,
                "model": row.model or "",
                "totalK": _token_k(row.total_tokens),
                "status": row.status,
                "errorCode": row.error_code,
                "latencyMs": row.latency_ms,
            }
            for row in recent_usage
        ],
    }


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    user = db.get(User, user_id)
    if not user:
        raise AppError(404, "NOT_FOUND", "用户不存在")

    username = payload.username.strip() if payload.username is not None else None
    display_name = payload.displayName.strip() if payload.displayName is not None else None
    if username is None and display_name is None:
        raise AppError(400, "VALIDATION_ERROR", "至少需要修改用户名或昵称")
    if username is not None:
        existing = db.scalar(select(User).where(func.lower(User.username) == username.lower(), User.id != user.id))
        if existing:
            raise AppError(409, "CONFLICT", "用户名已存在")
        user.username = username
    if display_name is not None:
        user.display_name = display_name
    user.updated_at = utc_now()
    db.commit()
    db.refresh(user)
    return _user_summary(db, user)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    payload: DeleteUserRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    user = db.get(User, user_id)
    if not user:
        raise AppError(404, "NOT_FOUND", "用户不存在")
    if payload.mode != "hard":
        raise AppError(400, "UNSUPPORTED_DELETE_MODE", "一期后台仅支持 hard 删除")
    confirm = payload.confirm.strip()
    if confirm not in {user.id, user.username or ""}:
        raise AppError(400, "CONFIRM_MISMATCH", "二次确认内容必须等于用户 ID 或用户名")

    counts = _user_counts(db, user.id)
    deleted_at = utc_now()
    goal_ids = [row[0] for row in db.execute(select(Goal.id).where(Goal.user_id == user.id)).all()]
    db.add(
        UserDeletionLog(
            id=new_id(),
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            deleted_at=deleted_at,
            goals_count=counts["goals"],
            task_nodes_count=counts["tasks"],
            check_ins_count=counts["checkIns"],
            skill_tags_count=counts["skillTags"],
            delete_mode="hard",
        )
    )
    db.execute(delete(SkillTag).where(SkillTag.user_id == user.id))
    db.execute(delete(TaskCheckIn).where(TaskCheckIn.user_id == user.id))
    if goal_ids:
        db.execute(delete(TaskNode).where(TaskNode.goal_id.in_(goal_ids)))
        db.execute(delete(Stage).where(Stage.goal_id.in_(goal_ids)))
    db.execute(delete(Goal).where(Goal.user_id == user.id))
    db.execute(delete(UserTagProfile).where(UserTagProfile.user_id == user.id))
    db.execute(delete(AIUsageLog).where(AIUsageLog.user_id == user.id))
    db.delete(user)
    db.commit()

    return {
        "deletedUserId": user.id,
        "username": user.username or "",
        "mode": "hard",
        "deletedAt": deleted_at,
        "counts": counts,
    }
