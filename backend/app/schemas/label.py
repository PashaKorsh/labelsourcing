import uuid
from typing import Dict, Any, Optional
from pydantic import BaseModel, ConfigDict


class LabelCreate(BaseModel):
    dataset_id: uuid.UUID
    data: Dict[str, Any]


class LabelResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    dataset_id: Optional[uuid.UUID]
    user_id: uuid.UUID
    data: Dict[str, Any]
    status: str

    model_config = ConfigDict(from_attributes=True)


class LabelStatusUpdate(BaseModel):
    status: str
