import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class AssignmentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    status: str
    assigned_at: datetime
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)
