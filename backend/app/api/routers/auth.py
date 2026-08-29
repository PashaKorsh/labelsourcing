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
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Role, UserRole
from app.core.config import settings
from app.core.security import verify_password, create_access_token, get_password_hash
from app.api.dependencies import get_current_user, get_user_from_refresh_token

router = APIRouter(prefix="/auth", tags=["Auth"])

YANDEX_AUTH_URL = "https://oauth.yandex.ru/authorize"
YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
YANDEX_USER_INFO_URL = "https://login.yandex.ru/info"
ACCESS_COOKIE_MAX_AGE = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
REFRESH_COOKIE_MAX_AGE = ACCESS_COOKIE_MAX_AGE + 2 * 24 * 60 * 60


def _set_auth_cookies(response: Response, user_id: uuid):
    access_token = create_access_token(
        data={"sub": str(user_id), "type": "access"},
        expires_delta=timedelta(seconds=ACCESS_COOKIE_MAX_AGE)
    )
    refresh_token = create_access_token(
        data={"sub": str(user_id), "type": "refresh"},
        expires_delta=timedelta(seconds=REFRESH_COOKIE_MAX_AGE)
    )

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_COOKIE_MAX_AGE,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
    )


def _encode_state(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def _decode_state(state: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(state.encode()).decode())


@router.post("/login")
async def login_for_access_token(
        response: Response,
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

    _set_auth_cookies(response, user.id)
    return {"ok": True, "message": "Successfully logged in"}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", httponly=True, secure=True, samesite="lax")
    response.delete_cookie(key="refresh_token", httponly=True, secure=True, samesite="lax")
    return {"ok": True}


@router.get("/yandex/login")
async def yandex_login(
        success_url: str = Query(default="/"),
        error_url: str = Query(default="/login"),
):
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
    try:
        state_data = _decode_state(state)
        success_url: str = state_data["success_url"]
        error_url: str = state_data["error_url"]
    except Exception:
        return RedirectResponse("/login")

    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(YANDEX_TOKEN_URL, data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.YANDEX_CLIENT_ID,
                "client_secret": settings.YANDEX_CLIENT_SECRET
            })
            token_resp.raise_for_status()
            yandex_token = token_resp.json()["access_token"]

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

    response = RedirectResponse(success_url)
    _set_auth_cookies(response, user.id)
    return response


_DEV_USERS: dict[str, dict] = {
    "admin": {"email": "dev-admin@localhost", "name": "Dev Admin", "roles": ["admin"]},
    "annotator-1": {"email": "dev-annotator-1@localhost", "name": "Dev Annotator 1", "roles": []},
    "annotator-2": {"email": "dev-annotator-2@localhost", "name": "Dev Annotator 2", "roles": []},
}


@router.post("/dev-login")
async def dev_login(
        response: Response,
        user: str = Query(...),
        db: AsyncSession = Depends(get_db),
):
    if not settings.DEV_MODE:
        raise HTTPException(status_code=403, detail="Доступно только в DEV_MODE")

    preset = _DEV_USERS.get(user)
    if not preset:
        raise HTTPException(status_code=400, detail=f"Неизвестный пользователь: {user}. Доступны: {list(_DEV_USERS)}")

    existing = (await db.execute(
        select(User).where(User.email == preset["email"]).options(selectinload(User.roles))
    )).scalar_one_or_none()

    if existing:
        db_user = existing
        existing_role_names = {r.name for r in db_user.roles}
    else:
        db_user = User(
            email=preset["email"],
            name=preset["name"],
            password=get_password_hash(str(uuid.uuid4())),
        )
        db.add(db_user)
        await db.flush()
        existing_role_names: set[str] = set()

    for role_name in preset["roles"]:
        if role_name in existing_role_names:
            continue
        role = (await db.execute(select(Role).where(Role.name == role_name))).scalar_one_or_none()
        if not role:
            role = Role(name=role_name)
            db.add(role)
            await db.flush()
        db.add(UserRole(user_id=db_user.id, role_id=role.id))

    await db.commit()
    await db.refresh(db_user)

    _set_auth_cookies(response, db_user.id)
    return {"ok": True}


@router.post("/refresh")
async def refresh_token(
        response: Response,
        current_user: User = Depends(get_user_from_refresh_token)
):
    _set_auth_cookies(response, current_user.id)

    return {"ok": True, "message": "Tokens refreshed successfully"}
