import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Role, Tag
from app.api.dependencies import get_current_user, require_roles
from app.schemas.user import UserResponse, UserUpdate, RoleResponse

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/roles", response_model=list[RoleResponse])
async def get_roles(
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    """Список всех ролей — для назначения пользователям (только Админ)"""
    result = await db.execute(select(Role).order_by(Role.name))
    return result.scalars().all()


@router.get("/me", response_model=UserResponse)
async def get_my_profile(
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Профиль текущего пользователя (с подгрузкой его ролей и тегов)"""
    stmt = select(User).options(
        selectinload(User.roles),
        selectinload(User.tags)
    ).where(User.id == current_user.id)

    result = await db.execute(stmt)
    return result.scalar_one()


@router.get("/", response_model=list[UserResponse])
async def get_all_users(
        limit: int = 100,
        offset: int = 0,
        search: Optional[str] = None,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    """Список всех пользователей для Панели управления (с поиском)"""
    stmt = select(User).options(
        selectinload(User.roles),
        selectinload(User.tags)
    )

    if search:
        stmt = stmt.where(User.email.ilike(f"%{search}%"))

    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user_access(
        user_id: uuid.UUID,
        update_data: UserUpdate,
        db: AsyncSession = Depends(get_db),
        admin_user: User = Depends(require_roles(["admin"]))
):
    """Изменить роли и теги пользователя (только Админ)"""
    # Ищем юзера
    stmt = select(User).options(selectinload(User.roles), selectinload(User.tags)).where(User.id == user_id)
    result = await db.execute(stmt)
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Обновляем роли, если они переданы
    if update_data.role_ids is not None:
        roles_result = await db.execute(select(Role).where(Role.id.in_(update_data.role_ids)))
        target_user.roles = list(roles_result.scalars().all())

    # Обновляем теги, если они переданы
    if update_data.tag_ids is not None:
        tags_result = await db.execute(select(Tag).where(Tag.id.in_(update_data.tag_ids)))
        target_user.tags = list(tags_result.scalars().all())

    await db.commit()
    # db.refresh не загружает relationships — делаем новый select
    stmt = select(User).options(
        selectinload(User.roles),
        selectinload(User.tags),
    ).where(User.id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one()
