import json
import uuid
import base64
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User
from app.core.config import settings
from app.core.security import verify_password, create_access_token, get_password_hash

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
                "client_secret": settings.YANDEX_CLIENT_SECRET,
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

    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        # Пользователь входит только через Яндекс — пароль не используется
        user = User(
            email=email,
            password=get_password_hash(str(uuid.uuid4())),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    access_token = create_access_token(data={"sub": str(user.id)})
    sep = "&" if "?" in success_url else "?"
    return RedirectResponse(f"{success_url}{sep}token={access_token}")
