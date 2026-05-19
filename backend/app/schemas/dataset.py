import uuid
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, field_validator, Field
from .tag import TagResponse


class AnnotationLabelSchema(BaseModel):
    id: str
    label: str
    color: str
    hotkey: Optional[str] = None


class DatasetCreate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    required_answers: int = 3
    default_labeling_limit: int = 50
    annotation_labels: List[AnnotationLabelSchema] = Field(
        default=[AnnotationLabelSchema(id="obj", label="Объект", color="#FF0000")]
    )
    tags: Optional[List[TagResponse]] = TagResponse()
    requires_validation: bool = False
    validation_quorum: int = 1
    settings: dict = Field(default_factory=dict)


class DatasetResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    title: Optional[str] = None
    description: Optional[str] = None
    required_answers: int = 3
    default_labeling_limit: int = 50
    status: str = "active"
    tasks_count: int = 0
    requires_validation: bool = False
    validation_quorum: int = 1
    # Единый статус для фронтенда (NOT_STARTED, IN_PROGRESS, USER_DONE, COMPLETED)
    user_status: str = "NOT_STARTED"
    user_done: bool = False
    user_labeling_limit: int | None = None
    user_labeled_count: int | None = None
    tags: list[TagResponse] = []
    annotation_labels: List[AnnotationLabelSchema] = []
    settings: dict = Field(default_factory=dict)
    model_config = ConfigDict(from_attributes=True)

    @field_validator('annotation_labels', mode='before')
    @classmethod
    def coerce_labels(cls, v: object) -> object:
        return v or []


class DatasetUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    required_answers: Optional[int] = None
    default_labeling_limit: Optional[int] = None
    status: Optional[str] = None
    tag_ids: Optional[list[uuid.UUID]] = None
    annotation_labels: Optional[List[AnnotationLabelSchema]] = None
    requires_validation: Optional[bool] = None
    validation_quorum: Optional[int] = None
    settings: Optional[dict] = None
