import uuid
from pydantic import BaseModel, ConfigDict


class UserDatasetAccessResponse(BaseModel):
    user_id: uuid.UUID
    dataset_id: uuid.UUID
    labeling_limit: int
    labeled_count: int
    can_label: bool

    model_config = ConfigDict(from_attributes=True)


class UserDatasetAccessUpdate(BaseModel):
    labeling_limit: int | None = None
    can_label: bool | None = None
