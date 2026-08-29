import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Tag, User
from app.api.dependencies import get_current_user, require_roles
from app.schemas.tag import TagCreate, TagResponse

router = APIRouter(prefix="/tags", tags=["Tags"])


@router.get("/", response_model=list[TagResponse])
async def get_tags(
        limit: int = 100,
        offset: int = 0,
        search: Optional[str] = None,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Получить список всех доступных тегов с пагинацией и поиском"""
    stmt = select(Tag)

    if search:
        stmt = stmt.order_by(Tag.id).where(Tag.name.ilike(f"%{search}%"))

    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=TagResponse)
async def create_tag(
    tag_in: TagCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Создать тег (admin). Имя уникально."""
    try:
        new_tag = Tag(name=tag_in.name, color=tag_in.color)
        db.add(new_tag)
        await db.commit()
        await db.refresh(new_tag)
        return new_tag
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Тег с именем '{tag_in.name}' уже существует"
        )


@router.patch("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: uuid.UUID,
    tag_in: TagCreate,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Обновить имя и/или цвет тега (admin)."""
    tag = await db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Тег не найден")
    tag.name = tag_in.name
    if tag_in.color is not None:
        tag.color = tag_in.color
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles(["admin"]))
):
    """Удалить тег (только для Админов)"""
    tag = await db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Тег не найден")
    await db.delete(tag)
    await db.commit()
