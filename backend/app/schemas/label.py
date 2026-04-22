import uuid
from typing import Dict, Any
from pydantic import BaseModel, ConfigDict

class LabelCreate(BaseModel):
    task_id: uuid.UUID
    data: Dict[str, Any]

class LabelResponse(LabelCreate):
    id: uuid.UUID
    user_id: uuid.UUID

    model_config = ConfigDict(from_attributes=True)

class LabelStatusUpdate(BaseModel):
    status: str