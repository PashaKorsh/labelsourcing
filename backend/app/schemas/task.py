import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict


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

    model_config = ConfigDict(from_attributes=True)


class TaskPublicResponse(BaseModel):
    """Ответ для аннотаторов: без оригинального URL изображения и внутренних счетчиков."""
    id: uuid.UUID
    dataset_id: uuid.UUID
    type: str
    task_metadata: Optional[Dict[str, Any]] = None
    expires_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TaskBatchCreate(BaseModel):
    dataset_id: uuid.UUID
    urls: list[str]
