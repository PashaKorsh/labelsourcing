import uuid
from typing import Optional
from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    color: Optional[str] = None


class TagResponse(TagCreate):
    id: uuid.UUID

    model_config = ConfigDict(from_attributes=True)
