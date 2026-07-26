from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException, status

from ..config import Settings


TOKEN_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens"
WEBSOCKET_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService."
    "BidiGenerateContentConstrained"
)


async def create_live_token(settings: Settings) -> dict[str, str]:
    if not settings.gemini_live_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini Live chưa được cấu hình trên máy chủ",
        )

    now = datetime.now(timezone.utc)
    expire_time = now + timedelta(minutes=30)
    new_session_expire_time = now + timedelta(seconds=60)
    payload = {
        "uses": 1,
        "expireTime": expire_time.isoformat().replace("+00:00", "Z"),
        "newSessionExpireTime": new_session_expire_time.isoformat().replace("+00:00", "Z"),
    }

    try:
        async with httpx.AsyncClient(timeout=settings.gemini_live_token_timeout_seconds) as client:
            response = await client.post(
                TOKEN_URL,
                headers={
                    "x-goog-api-key": settings.gemini_live_api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            token = str(response.json().get("name") or "").strip()
    except (httpx.HTTPError, ValueError, TypeError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không thể tạo phiên Gemini Live",
        ) from error

    if not token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini Live không trả về token hợp lệ",
        )

    return {
        "token": token,
        "model": settings.gemini_live_model,
        "websocketUrl": WEBSOCKET_URL,
        "expiresAt": expire_time.isoformat().replace("+00:00", "Z"),
    }
