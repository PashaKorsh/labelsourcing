import uuid
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.database import get_db, async_session
from app.models import User, Utility, UtilityPairingCode, Dataset, Task, TaskType, SourceType
from app.api.dependencies import get_current_user
from app.api.utility_manager import (
    manager, create_utility_token, authenticate_utility_token,
    UtilityOffline, UtilityFileError,
)
from app.schemas.utility import (
    PairingCodeResponse, UtilityResponse, UtilityPairRequest, UtilityPairResponse,
    UtilityHeartbeat, UtilityTasksPush, UtilityTasksPushResponse,
    DirListing, ScanRequest, ScanResponse,
)

router = APIRouter(prefix="/utility", tags=["Utility"])

PAIRING_CODE_TTL_MINUTES = 10
# Без похожих символов (0/O, 1/I/L) — код вводят руками
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _generate_code() -> str:
    raw = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


# ── Утилита-аутентификация (Bearer-токен утилиты) ──

async def get_current_utility(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Utility:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    utility = await authenticate_utility_token(token, db)
    if utility is None:
        raise HTTPException(status_code=401, detail="Неверный токен утилиты")
    return utility


async def _owned_utility(utility_id: uuid.UUID, db: AsyncSession, user: User) -> Utility:
    utility = await db.get(Utility, utility_id)
    if utility is None or utility.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Утилита не найдена")
    if not manager.is_online(utility_id):
        raise HTTPException(status_code=503, detail="Утилита не в сети")
    return utility


async def _create_tasks_from_paths(db: AsyncSession, dataset: Dataset, paths: list[str]) -> tuple[int, int]:
    existing_urls = set((await db.execute(
        select(Task.url).where(Task.dataset_id == dataset.id)
    )).scalars().all())
    added = 0
    for path in paths:
        rel = path.strip().lstrip("/")
        if not rel or rel in existing_urls:
            continue
        db.add(Task(dataset_id=dataset.id, url=rel, type=TaskType.ANNOTATION))
        existing_urls.add(rel)
        added += 1
    dataset.tasks_count += added
    return added, len(existing_urls)


# ── Веб: управление привязкой (авторизация обычным пользователем) ──

@router.post("/pairing-code", response_model=PairingCodeResponse)
async def create_pairing_code(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Сгенерировать одноразовый код привязки утилиты к текущему пользователю."""
    # Чистим протухшие коды заодно
    await db.execute(delete(UtilityPairingCode).where(UtilityPairingCode.expires_at < datetime.utcnow()))

    code = _generate_code()
    while await db.get(UtilityPairingCode, code) is not None:
        code = _generate_code()

    expires_at = datetime.utcnow() + timedelta(minutes=PAIRING_CODE_TTL_MINUTES)
    db.add(UtilityPairingCode(code=code, user_id=current_user.id, expires_at=expires_at))
    await db.commit()
    return PairingCodeResponse(code=code, expires_at=expires_at)


@router.get("/", response_model=list[UtilityResponse])
async def list_utilities(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список утилит текущего пользователя с признаком online."""
    utilities = (await db.execute(
        select(Utility).where(Utility.owner_id == current_user.id).order_by(Utility.created_at)
    )).scalars().all()
    result = []
    for u in utilities:
        resp = UtilityResponse.model_validate(u)
        resp.online = manager.is_online(u.id)
        result.append(resp)
    return result


@router.delete("/{utility_id}", status_code=204)
async def delete_utility(
    utility_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Отвязать утилиту. Все датасеты, привязанные к ней, удаляются вместе с разметкой."""
    utility = await db.get(Utility, utility_id)
    if not utility or utility.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Утилита не найдена")
    # Удаляем связанные датасеты (каскадом уйдут задачи/ассайнменты/разметка)
    await db.execute(delete(Dataset).where(Dataset.utility_id == utility_id))
    await db.delete(utility)
    await db.commit()


# ── Утилита: обмен кода на токен ──

@router.post("/pair", response_model=UtilityPairResponse)
async def pair_utility(
    body: UtilityPairRequest,
    db: AsyncSession = Depends(get_db),
):
    """Утилита присылает код привязки → получает долгоживущий токен. Код одноразовый."""
    pairing = await db.get(UtilityPairingCode, body.code.strip().upper())
    if pairing is None or pairing.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Код недействителен или истёк")

    utility = Utility(
        owner_id=pairing.user_id,
        name=body.name,
        token_hash="",
        public_base_url=body.public_base_url or None,
    )
    db.add(utility)
    await db.flush()

    token, token_hash = create_utility_token(utility.id)
    utility.token_hash = token_hash

    await db.delete(pairing)  # код одноразовый
    await db.commit()
    return UtilityPairResponse(utility_id=utility.id, token=token)


# ── Утилита: heartbeat и пуш задач (авторизация токеном утилиты) ──

@router.post("/heartbeat", response_model=UtilityResponse)
async def utility_heartbeat(
    body: UtilityHeartbeat,
    db: AsyncSession = Depends(get_db),
    utility: Utility = Depends(get_current_utility),
):
    utility.last_seen_at = datetime.utcnow()
    if body.public_base_url is not None:
        utility.public_base_url = body.public_base_url or None
    await db.commit()
    await db.refresh(utility)
    resp = UtilityResponse.model_validate(utility)
    resp.online = manager.is_online(utility.id)
    return resp


@router.post("/datasets/{dataset_id}/tasks", response_model=UtilityTasksPushResponse)
async def push_tasks(
    dataset_id: uuid.UUID,
    body: UtilityTasksPush,
    db: AsyncSession = Depends(get_db),
    utility: Utility = Depends(get_current_utility),
):
    """Утилита присылает список относительных путей файлов папки → создаются задачи."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    if dataset.source_type != SourceType.UTILITY or dataset.utility_id != utility.id:
        raise HTTPException(status_code=403, detail="Датасет не привязан к этой утилите")

    added, total = await _create_tasks_from_paths(db, dataset, body.paths)
    await db.commit()
    return UtilityTasksPushResponse(added=added, total=total)


# ── Веб: файловый браузер и сканирование (через WS-команды к утилите) ──

@router.get("/{utility_id}/dirs", response_model=DirListing)
async def list_dirs(
    utility_id: uuid.UUID,
    path: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список подпапок на машине модератора в пределах разрешённых корней утилиты."""
    await _owned_utility(utility_id, db, current_user)
    try:
        data = await manager.command(utility_id, {"type": "list_dirs", "path": path})
    except UtilityOffline:
        raise HTTPException(status_code=503, detail="Утилита не в сети")
    except UtilityFileError as e:
        raise HTTPException(status_code=400, detail=e.detail or "Недоступный путь")
    return DirListing(**data)


@router.post("/{utility_id}/scan", response_model=ScanResponse)
async def scan_folder(
    utility_id: uuid.UUID,
    body: ScanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Привязать папку к датасету и просканировать её (создать задачи)."""
    await _owned_utility(utility_id, db, current_user)
    dataset = await db.get(Dataset, body.dataset_id)
    if not dataset or dataset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    if dataset.source_type != SourceType.UTILITY or dataset.utility_id != utility_id:
        raise HTTPException(status_code=400, detail="Датасет не привязан к этой утилите")

    return await _do_scan(db, dataset, utility_id, body.path)


@router.post("/{utility_id}/rescan/{dataset_id}", response_model=ScanResponse)
async def rescan_folder(
    utility_id: uuid.UUID,
    dataset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Повторно просканировать уже выбранную папку датасета — догрузить новые файлы."""
    await _owned_utility(utility_id, db, current_user)
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Датасет не найден")
    if not dataset.utility_folder:
        raise HTTPException(status_code=400, detail="Папка ещё не выбрана")
    return await _do_scan(db, dataset, utility_id, dataset.utility_folder)


async def _do_scan(db: AsyncSession, dataset: Dataset, utility_id: uuid.UUID, path: str) -> ScanResponse:
    try:
        data = await manager.command(
            utility_id,
            {"type": "scan", "dataset_id": str(dataset.id), "path": path},
            timeout=120.0,
        )
    except UtilityOffline:
        raise HTTPException(status_code=503, detail="Утилита не в сети")
    except UtilityFileError as e:
        raise HTTPException(status_code=400, detail=e.detail or "Не удалось просканировать папку")

    folder = data.get("folder", path)
    dataset.utility_folder = folder
    added, total = await _create_tasks_from_paths(db, dataset, data.get("paths", []))
    await db.commit()
    return ScanResponse(folder=folder, added=added, total=total)


# ── Утилита: WebSocket-туннель для отдачи файлов ──

@router.websocket("/connect")
async def utility_connect(websocket: WebSocket):
    token = websocket.query_params.get("token")

    async with async_session() as db:
        utility = await authenticate_utility_token(token, db)
        if utility is None:
            await websocket.close(code=4401)
            return
        utility.last_seen_at = datetime.utcnow()
        await db.commit()
        utility_id = utility.id

    await websocket.accept()
    manager.register(utility_id, websocket)
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            manager.on_message(message)
    except WebSocketDisconnect:
        pass
    finally:
        manager.unregister(utility_id)
