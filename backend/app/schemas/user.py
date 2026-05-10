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
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    roles: List[RoleResponse] = []
    tags: List[TagResponse] = []

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """Схема для админа: назначаем роли и теги юзеру"""
    role_ids: Optional[List[uuid.UUID]] = None
    tag_ids: Optional[List[uuid.UUID]] = None