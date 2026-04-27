from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from jose import JWTError, jwt

from app.database import get_db
from app.core.config import settings
from app.models import User


def _extract_token(request: Request) -> str | None:
    # Сначала кука, затем Authorization-заголовок как fallback для API-клиентов
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    return token or None


async def get_current_user(
        request: Request,
        db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = _extract_token(request)
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


def require_roles(allowed_roles: list[str]):
    async def role_checker(
            request: Request,
            db: AsyncSession = Depends(get_db)
    ) -> User:
        current_user = await get_current_user(request, db)

        stmt = select(User).options(selectinload(User.roles)).where(User.id == current_user.id)
        result = await db.execute(stmt)
        user_with_roles = result.scalar_one()

        user_role_names = [role.name for role in user_with_roles.roles]

        if not any(role in allowed_roles for role in user_role_names):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="У вас нет прав для выполнения этой операции"
            )
        return user_with_roles

    return role_checker