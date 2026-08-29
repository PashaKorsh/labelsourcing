"""Инфраструктура утилит: токены, аутентификация и реестр живых WebSocket-соединений.

Картинки из локальной утилиты за NAT попадают к браузеру так:
    Утилита (держит исходящий WS) → этот сервер → браузер.
Когда /proxy нужен файл, он зовёт manager.fetch_file(), который шлёт запрос
в WS утилиты и ждёт бинарный ответ. Корреляция запрос/ответ — по req_id.

Реестр живёт в памяти процесса, поэтому деплой должен быть одним воркером uvicorn.
"""
import json
import uuid
import asyncio
import secrets
from dataclasses import dataclass, field

from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Utility
from app.core.security import get_password_hash, verify_password


def create_utility_token(utility_id: uuid.UUID) -> tuple[str, str]:
    """Возвращает (токен для утилиты, bcrypt-хеш секрета для хранения в БД)."""
    secret = secrets.token_urlsafe(32)
    token = f"{utility_id}.{secret}"
    return token, get_password_hash(secret)


async def authenticate_utility_token(token: str | None, db: AsyncSession) -> Utility | None:
    if not token or "." not in token:
        return None
    uid_str, secret = token.split(".", 1)
    try:
        utility_id = uuid.UUID(uid_str)
    except ValueError:
        return None
    utility = await db.get(Utility, utility_id)
    if utility is None or not verify_password(secret, utility.token_hash):
        return None
    return utility


class UtilityOffline(Exception):
    """Утилита не подключена к серверу."""


class UtilityFileError(Exception):
    """Утилита не смогла отдать файл."""
    def __init__(self, status: int, detail: str = ""):
        self.status = status
        self.detail = detail
        super().__init__(detail)


@dataclass
class _Connection:
    ws: WebSocket
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class UtilityConnectionManager:
    def __init__(self) -> None:
        self._conns: dict[uuid.UUID, _Connection] = {}
        self._pending: dict[str, asyncio.Future] = {}

    def is_online(self, utility_id: uuid.UUID) -> bool:
        return utility_id in self._conns

    def register(self, utility_id: uuid.UUID, ws: WebSocket) -> _Connection:
        conn = _Connection(ws=ws)
        self._conns[utility_id] = conn
        return conn

    def unregister(self, utility_id: uuid.UUID) -> None:
        self._conns.pop(utility_id, None)

    async def _round_trip(self, utility_id: uuid.UUID, message: dict, timeout: float):
        conn = self._conns.get(utility_id)
        if conn is None:
            raise UtilityOffline()
        req_id = uuid.uuid4().hex
        message["req_id"] = req_id
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        self._pending[req_id] = fut
        try:
            async with conn.send_lock:
                await conn.ws.send_text(json.dumps(message))
            return await asyncio.wait_for(fut, timeout)
        except asyncio.TimeoutError:
            raise UtilityFileError(504, "Утилита не ответила вовремя")
        finally:
            self._pending.pop(req_id, None)

    async def fetch_file(
        self,
        utility_id: uuid.UUID,
        folder: str,
        path: str,
        timeout: float = 30.0,
    ) -> tuple[str, bytes]:
        """Запрашивает файл у утилиты. Возвращает (content_type, bytes)."""
        return await self._round_trip(
            utility_id, {"type": "fetch", "folder": folder, "path": path}, timeout
        )

    async def command(
        self,
        utility_id: uuid.UUID,
        message: dict,
        timeout: float = 60.0,
    ) -> dict:
        """Шлёт команду утилите и ждёт JSON-ответ (list_dirs, scan, …)."""
        return await self._round_trip(utility_id, message, timeout)

    # Вызывается из приёмного цикла WS-эндпоинта на каждое сообщение от утилиты.
    def on_message(self, message: dict) -> None:
        if "bytes" in message and message["bytes"] is not None:
            self._on_binary(message["bytes"])
        elif "text" in message and message["text"] is not None:
            self._on_text(message["text"])

    def _resolve(self, req_id: str, result=None, error: Exception | None = None) -> None:
        fut = self._pending.get(req_id)
        if fut is None or fut.done():
            return
        if error is not None:
            fut.set_exception(error)
        else:
            fut.set_result(result)

    def _on_text(self, text: str) -> None:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return
        mtype = data.get("type")
        if mtype == "error":
            self._resolve(
                data.get("req_id", ""),
                error=UtilityFileError(data.get("status", 502), data.get("detail", "")),
            )
        elif mtype == "response":
            if data.get("ok", False):
                self._resolve(data.get("req_id", ""), result=data.get("data", {}))
            else:
                self._resolve(
                    data.get("req_id", ""),
                    error=UtilityFileError(data.get("status", 502), data.get("error", "")),
                )

    def _on_binary(self, raw: bytes) -> None:
        # Кадр: 32 байта req_id (hex) + 1 байт длины content-type + content-type + тело
        if len(raw) < 33:
            return
        req_id = raw[:32].decode("ascii", errors="ignore")
        ct_len = raw[32]
        ct = raw[33:33 + ct_len].decode("ascii", errors="ignore") or "application/octet-stream"
        body = raw[33 + ct_len:]
        self._resolve(req_id, result=(ct, body))


manager = UtilityConnectionManager()
