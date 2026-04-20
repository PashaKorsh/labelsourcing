import uuid
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.tag import TagResponse


class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str
    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    created_at: datetime
    # Подтягиваем связи, чтобы отдавать юзера сразу с его ролями и тегами
    roles: List[RoleResponse] = []
    tags: List[TagResponse] = []

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """Схема для админа: назначаем роли и теги юзеру"""
    role_ids: Optional[List[uuid.UUID]] = None
    tag_ids: Optional[List[uuid.UUID]] = None