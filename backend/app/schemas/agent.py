import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class PairingCodeResponse(BaseModel):
    code: str
    expires_in: int  # секунды


class AgentPairRequest(BaseModel):
    code: str
    name: str
    base_url: str  # публичный URL, где агент доступен


class AgentPairResponse(BaseModel):
    agent_id: uuid.UUID
    device_token: str  # показывается только один раз


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    base_url: str
    is_active: bool
    last_seen_at: Optional[datetime]
    created_at: datetime


class AgentFileItem(BaseModel):
    path: str  # относительный путь файла внутри папки датасета на машине агента


class AgentDatasetSyncRequest(BaseModel):
    """Загрузка списка файлов в уже созданный в веб-интерфейсе датасет."""

    files: list[AgentFileItem]


class AgentSyncResponse(BaseModel):
    dataset_id: uuid.UUID
    accepted: int
