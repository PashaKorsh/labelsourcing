import uuid
from datetime import datetime
from typing import Dict, Any
from pydantic import BaseModel, ConfigDict


class LabelSubmit(BaseModel):
    data: Dict[str, Any]


class LabelResponse(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    result: Dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
