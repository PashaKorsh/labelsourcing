import uuid
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict

class TaskCreate(BaseModel):
    dataset_id: uuid.UUID
    url: str
    task_metadata: Optional[Dict[str, Any]] = None

class TaskResponse(TaskCreate):
    id: uuid.UUID

    model_config = ConfigDict(from_attributes=True)

class TaskBatchCreate(BaseModel):
    dataset_id: uuid.UUID
    urls: list[str]