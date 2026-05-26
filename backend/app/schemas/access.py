import uuid
from pydantic import BaseModel, ConfigDict


class UserDatasetAccessResponse(BaseModel):
    user_id: uuid.UUID
    dataset_id: uuid.UUID
    tasks_limit: int
    tasks_done: int
    can_label: bool

    model_config = ConfigDict(from_attributes=True)


class UserDatasetAccessUpdate(BaseModel):
    tasks_limit: int | None = None
    can_label: bool | None = None
