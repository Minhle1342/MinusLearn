from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pymongo.errors import DuplicateKeyError

from ..config import get_settings
from ..dependencies import get_current_user, get_database
from ..schemas import AuthRequest, TokenResponse
from ..security import create_token, decode_token, hash_password, verify_password


router = APIRouter(prefix="/api/auth", tags=["auth"])
REFRESH_COOKIE = "minuslearn_refresh"


def public_user(user: dict) -> dict:
    return {"id": user["userId"], "email": user["email"]}


def set_refresh_cookie(response: Response, user_id: str, remember_me: bool = True) -> None:
    settings = get_settings()
    max_age = settings.refresh_token_days * 24 * 60 * 60 if remember_me else None
    response.set_cookie(
        REFRESH_COOKIE,
        create_token(user_id, "refresh"),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/api/auth",
    )


def auth_response(response: Response, user: dict, remember_me: bool = True) -> dict:
    set_refresh_cookie(response, user["userId"], remember_me)
    return {
        "access_token": create_token(user["userId"], "access"),
        "token_type": "bearer",
        "user": public_user(user),
    }


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: AuthRequest, response: Response, database=Depends(get_database)):
    email = payload.email.lower()
    if await database.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = {
        "userId": str(uuid4()),
        "email": email,
        "passwordHash": hash_password(payload.password),
        "createdAt": datetime.now(timezone.utc),
    }
    try:
        await database.users.insert_one(user)
    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="Email already registered") from error
    return auth_response(response, user, payload.remember_me)


@router.post("/login", response_model=TokenResponse)
async def login(payload: AuthRequest, response: Response, database=Depends(get_database)):
    user = await database.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return auth_response(response, user, payload.remember_me)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, database=Depends(get_database)):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    try:
        user_id = decode_token(token, "refresh")
    except ValueError as error:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from error
    user = await database.users.find_one({"userId": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return auth_response(response, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return public_user(user)
