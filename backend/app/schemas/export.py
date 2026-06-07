import uuid
from typing import List
from pydantic import BaseModel

class ExportShape(BaseModel):
    tag: str
    area: float
    segmentation: List[List[float]]
    iscrowd: int = 0

class ExportLabel(BaseModel):
    label_id: uuid.UUID
    assignment_status: str
    result: List[ExportShape]

class ExportTask(BaseModel):
    task_id: uuid.UUID
    task_url: str
    task_status: str
    labels: List[ExportLabel]