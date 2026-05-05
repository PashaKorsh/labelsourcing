import uuid
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, field_validator
from .tag import TagResponse


class AnnotationLabelSchema(BaseModel):
    id: str
    label: str
    color: str
    hotkey: Optional[str] = None


class DatasetCreate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    annotation_labels: Optional[List[AnnotationLabelSchema]] = None


class DatasetResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    title: Optional[str] = None
    description: Optional[str] = None
    tasks_count: int = 0
    labeled_count: int = 0
    tags: list[TagResponse] = []
    annotation_labels: List[AnnotationLabelSchema] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator('annotation_labels', mode='before')
    @classmethod
    def coerce_labels(cls, v: object) -> object:
        return v or []


class DatasetUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tag_ids: Optional[list[uuid.UUID]] = None
    annotation_labels: Optional[List[AnnotationLabelSchema]] = None
