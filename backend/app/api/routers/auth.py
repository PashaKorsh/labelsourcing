import json
import uuid
import base64
from urllib.parse import urlencode
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User
from app.core.config import settings
from app.core.security import verify_password, create_access_token, get_password_hash
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])

YANDEX_AUTH_URL = "https://oauth.yandex.ru/authorize"
YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
YANDEX_USER_INFO_URL = "https://login.yandex.ru/info"


def _encode_state(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def _decode_state(state: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(state.encode()).decode())


@router.post("/login")
async def login_for_access_token(
        form_data: OAuth2PasswordRequestForm = Depends(),
        db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.email == form_data.username)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(response: Response):
    """Выход из системы — удаляет cookie с токеном"""
    response.delete_cookie(key="access_token", httponly=True, secure=True, samesite="lax")
    return {"ok": True}


@router.get("/yandex/login")
async def yandex_login(
    success_url: str = Query(default="/"),
    error_url: str = Query(default="/login"),
):
    """
    Редиректит пользователя на Яндекс OAuth.
    success_url и error_url — абсолютные URL, на которые Яндекс вернёт пользователя
    после авторизации (успех/ошибка). Передаются через state OAuth.
    """
    state = _encode_state({"success_url": success_url, "error_url": error_url})
    params = urlencode({
        "response_type": "code",
        "client_id": settings.YANDEX_CLIENT_ID,
        "redirect_uri": settings.YANDEX_REDIRECT_URI,
        "state": state,
        "force_confirm": "yes"
    })
    return RedirectResponse(f"{YANDEX_AUTH_URL}?{params}")


@router.get("/yandex/callback")
async def yandex_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Callback от Яндекса. Обменивает code на токен, получает email пользователя,
    создаёт его в БД если нового, выпускает JWT и редиректит на success_url.
    """
    try:
        state_data = _decode_state(state)
        success_url: str = state_data["success_url"]
        error_url: str = state_data["error_url"]
    except Exception:
        return RedirectResponse("/login")

    try:
        async with httpx.AsyncClient() as client:
            # Обмен code на access_token Яндекса
            token_resp = await client.post(YANDEX_TOKEN_URL, data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.YANDEX_CLIENT_ID,
                "client_secret": settings.YANDEX_CLIENT_SECRET
            })
            token_resp.raise_for_status()
            yandex_token = token_resp.json()["access_token"]

            # Получение данных пользователя
            user_resp = await client.get(
                YANDEX_USER_INFO_URL,
                headers={"Authorization": f"OAuth {yandex_token}"},
                params={"format": "json"},
            )
            user_resp.raise_for_status()
            user_info = user_resp.json()
    except Exception:
        return RedirectResponse(error_url)

    email = user_info.get("default_email") or (user_info.get("emails") or [None])[0]
    if not email:
        return RedirectResponse(error_url)

    # Извлекаем имя и аватар из ответа Яндекса
    yandex_name = user_info.get("real_name") or user_info.get("display_name")
    avatar_id = user_info.get("default_avatar_id")
    is_avatar_empty = user_info.get("is_avatar_empty", True)
    yandex_avatar_url = (
        f"https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"
        if avatar_id and not is_avatar_empty
        else None
    )

    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=email,
            password=get_password_hash(str(uuid.uuid4())),
            name=yandex_name,
            avatar_url=yandex_avatar_url,
        )
        db.add(user)
    else:
        user.name = yandex_name
        user.avatar_url = yandex_avatar_url

    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(data={"sub": str(user.id)})
    response = RedirectResponse(success_url)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return response


@router.post("/refresh")
async def refresh_token(
        current_user: User = Depends(get_current_user)
):
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    new_access_token = create_access_token(
        data={"sub": current_user.email},
        expires_delta=access_token_expires
    )

    return {"access_token": new_access_token, "token_type": "bearer"}