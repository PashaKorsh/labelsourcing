import uuid
from datetime import datetime
from typing import Optional, Dict, Any, Any
from pydantic import BaseModel, ConfigDict, field_serializer


class TaskCreate(BaseModel):
    dataset_id: uuid.UUID
    url: str
    task_metadata: Optional[Dict[str, Any]] = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    url: str
    type: str
    completed_answers: int
    active_assignments: int
    status: str
    task_metadata: Optional[Dict[str, Any]] = None
    expires_at: datetime | None = None
    full_url: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_serializer('full_url')
    def serialize_full_url(self, full_url: str | None, _info: Any) -> str | None:
        return full_url


class TaskBatchCreate(BaseModel):
    dataset_id: uuid.UUID
    urls: list[str]
