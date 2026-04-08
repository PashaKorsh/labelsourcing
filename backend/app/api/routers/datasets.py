from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Dataset, User
from app.api.dependencies import get_current_user
from app.schemas.dataset import DatasetCreate, DatasetResponse

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post("/", response_model=DatasetResponse)
async def create_dataset(
        dataset_in: DatasetCreate,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Создать новый набор данных (роль: Админ/Менеджер)"""
    new_dataset = Dataset(
        owner_id=current_user.id,
        description=dataset_in.description
    )
    db.add(new_dataset)
    await db.commit()
    await db.refresh(new_dataset)
    return new_dataset


@router.get("/", response_model=list[DatasetResponse])
async def get_datasets(
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    """Получить список всех наборов данных"""
    query = select(Dataset)
    result = await db.execute(query)
    return result.scalars().all()
