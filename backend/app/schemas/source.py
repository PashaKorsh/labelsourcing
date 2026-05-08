import uuid
from pydantic import BaseModel


class SourceResponse(BaseModel):
    id: uuid.UUID
    name: str
