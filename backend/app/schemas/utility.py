import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class PairingCodeResponse(BaseModel):
    code: str
    expires_at: datetime


class UtilityResponse(BaseModel):
    id: uuid.UUID
    name: str
    public_base_url: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    created_at: datetime
    online: bool = False

    model_config = ConfigDict(from_attributes=True)


class UtilityPairRequest(BaseModel):
    code: str
    name: str
    public_base_url: Optional[str] = None


class UtilityPairResponse(BaseModel):
    utility_id: uuid.UUID
    token: str


class UtilityHeartbeat(BaseModel):
    public_base_url: Optional[str] = None


class UtilityTasksPush(BaseModel):
    """Утилита присылает список относительных путей файлов для датасета."""
    paths: List[str]


class UtilityTasksPushResponse(BaseModel):
    added: int
    total: int


class DirEntry(BaseModel):
    name: str
    path: str


class DirListing(BaseModel):
    path: str
    parent: Optional[str] = None
    dirs: List[DirEntry] = []
    image_count: int = 0


class ScanRequest(BaseModel):
    dataset_id: uuid.UUID
    path: str


class ScanResponse(BaseModel):
    folder: str
    added: int
    total: int
