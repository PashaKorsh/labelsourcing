import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from .tag import TagResponse

class DatasetCreate(BaseModel):
    description: Optional[str] = None

class DatasetResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    description: Optional[str] = None
    tasks_count: int = 0
    labeled_count: int = 0
    tags: list[TagResponse] = []

    model_config = ConfigDict(from_attributes=True)

class DatasetUpdate(BaseModel):
    description: Optional[str] = None
    tag_ids: Optional[list[uuid.UUID]] = None