import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class DatasetCreate(BaseModel):
    description: Optional[str] = None

class DatasetResponse(DatasetCreate):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)