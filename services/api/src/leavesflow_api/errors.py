from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: dict | None = None) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


def error_response(request: Request, status_code: int, code: str, message: str, details: dict | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "requestId": getattr(request.state, "request_id", ""),
                "details": details,
            }
        },
    )
