from __future__ import annotations

import secrets

from fastapi import Depends, Header, Request

from .config import Settings, get_settings
from .errors import AppError


def get_current_user_id(
    request: Request,
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError(401, "UNAUTHORIZED", "缺少或无效的访问令牌")
    token = authorization.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, settings.app.demo_bearer_token):
        raise AppError(401, "UNAUTHORIZED", "访问令牌错误")
    request.state.user_id = settings.app.demo_user_id
    return settings.app.demo_user_id
