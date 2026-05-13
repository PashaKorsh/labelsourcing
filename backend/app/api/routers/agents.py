import secrets
import uuid
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.models import Dataset, LocalAgent, PairingCode, Task, DatasetSourceType, User
from app.schemas.agent import (
    AgentDatasetSyncRequest,
    AgentPairRequest,
    AgentPairResponse,
    AgentResponse,
    AgentSyncResponse,
    PairingCodeResponse,
)

router = APIRouter(prefix="/agents", tags=["Agents"])

PAIRING_CODE_TTL_SECONDS = 300


async def _get_agent_by_token(request: Request, agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> LocalAgent:
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    agent = await db.get(LocalAgent, agent_id)
    if not agent or not agent.is_active or not secrets.compare_digest(agent.device_token, token):
        raise HTTPException(status_code=401, detail="Invalid agent credentials")
    return agent


# --- Веб-браузер (JWT) ---

@router.post("/pairing-code", response_model=PairingCodeResponse)
async def create_pairing_code(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Генерирует одноразовый код сопряжения (5 минут). Пользователь вводит его в утилиту."""
    code = secrets.token_hex(4).upper()  # 8 символов вида "A3F7K2X4"
    expires_at = datetime.utcnow() + timedelta(seconds=PAIRING_CODE_TTL_SECONDS)
    db.add(PairingCode(user_id=current_user.id, code=code, expires_at=expires_at))
    await db.commit()
    return PairingCodeResponse(code=code, expires_in=PAIRING_CODE_TTL_SECONDS)


@router.get("/", response_model=list[AgentResponse])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LocalAgent).where(LocalAgent.user_id == current_user.id, LocalAgent.is_active == True)
    )
    return result.scalars().all()


@router.delete("/{agent_id}", status_code=204)
async def deactivate_agent(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agent = await db.get(LocalAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Агент не найден")
    agent.is_active = False
    await db.commit()


# --- Утилита (device_token или pairing code) ---

@router.post("/pair", response_model=AgentPairResponse)
async def pair_agent(
    body: AgentPairRequest,
    db: AsyncSession = Depends(get_db),
):
    """Обменивает одноразовый pairing code на device_token. Вызывается утилитой."""
    result = await db.execute(
        select(PairingCode).where(PairingCode.code == body.code, PairingCode.used == False)
    )
    pairing = result.scalar_one_or_none()

    if not pairing or pairing.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Неверный или истёкший код сопряжения")

    device_token = secrets.token_hex(32)
    agent = LocalAgent(
        user_id=pairing.user_id,
        name=body.name,
        base_url=body.base_url.rstrip("/"),
        device_token=device_token,
    )
    db.add(agent)
    pairing.used = True
    await db.commit()
    await db.refresh(agent)

    return AgentPairResponse(agent_id=agent.id, device_token=device_token)


@router.post("/{agent_id}/datasets/{dataset_id}/sync", response_model=AgentSyncResponse)
async def sync_dataset_files(
    agent_id: uuid.UUID,
    dataset_id: uuid.UUID,
    body: AgentDatasetSyncRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Заполняет задачи датасета, созданного в веб-интерфейсе, по списку файлов с машины агента."""
    agent = await _get_agent_by_token(request, agent_id, db)

    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.owner_id != agent.user_id:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    if dataset.source_type != DatasetSourceType.LOCAL_AGENT or dataset.local_agent_id != agent.id:
        raise HTTPException(status_code=400, detail="Датасет не привязан к этому агенту")

    await db.execute(delete(Task).where(Task.dataset_id == dataset_id))

    for f in body.files:
        db.add(Task(dataset_id=dataset.id, url=f.path))
    dataset.tasks_count = len(body.files)

    agent.last_seen_at = datetime.utcnow()
    await db.commit()

    return AgentSyncResponse(dataset_id=dataset.id, accepted=len(body.files))


@router.get("/{agent_id}/health")
async def check_agent_health(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Пингует агент и обновляет last_seen_at."""
    agent = await db.get(LocalAgent, agent_id)
    if not agent or agent.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Агент не найден")

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{agent.base_url}/health")
        ok = resp.status_code == 200
    except Exception:
        ok = False

    if ok:
        agent.last_seen_at = datetime.utcnow()
        await db.commit()

    return {"online": ok, "last_seen_at": agent.last_seen_at}
