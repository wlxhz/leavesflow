from __future__ import annotations

import secrets

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import get_db
from .errors import AppError
from .models import User


def get_current_user_id(
    request: Request,
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError(401, "UNAUTHORIZED", "缺少或无效的访问令牌")
    token = authorization.removeprefix("Bearer ").strip()
    user = db.scalar(select(User).where(User.auth_token == token))
    if not user and secrets.compare_digest(token, settings.app.demo_bearer_token):
        user = db.get(User, settings.app.demo_user_id)
    if not user:
        raise AppError(401, "UNAUTHORIZED", "访问令牌错误")
    request.state.user_id = user.id
    return user.id
