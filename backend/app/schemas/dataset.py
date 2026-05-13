import uuid
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .tag import TagResponse
from app.models import DatasetSourceType


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
    annotation_labels: Optional[List[AnnotationLabelSchema]] = None
    tag_ids: Optional[List[uuid.UUID]] = None
    source_type: DatasetSourceType = DatasetSourceType.EXTERNAL_URL
    local_agent_id: Optional[uuid.UUID] = None
    # Расширяемые параметры источника (Яндекс.Диск и др.) — см. документацию API
    source_config: Optional[Dict[str, Any]] = Field(default=None, description="Провайдер-специфичные настройки")
    requires_validation: bool = False
    validation_quorum: int = 1


class DatasetResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    title: Optional[str] = None
    description: Optional[str] = None
    required_answers: int = 3
    default_labeling_limit: int = 50
    status: str = "active"
    source_type: str = DatasetSourceType.EXTERNAL_URL.value
    local_agent_id: Optional[uuid.UUID] = None
    source_config: Optional[Dict[str, Any]] = None
    tasks_count: int = 0
    requires_validation: bool = False
    validation_quorum: int = 1
    user_done: bool = False
    user_labeling_limit: int | None = None
    user_labeled_count: int | None = None
    tags: list[TagResponse] = []
    annotation_labels: List[AnnotationLabelSchema] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator('source_type', mode='before')
    @classmethod
    def coerce_source_type(cls, v: object) -> object:
        if isinstance(v, DatasetSourceType):
            return v.value
        return v

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
    local_agent_id: Optional[uuid.UUID] = None
    source_config: Optional[Dict[str, Any]] = None
    requires_validation: Optional[bool] = None
    validation_quorum: Optional[int] = None
