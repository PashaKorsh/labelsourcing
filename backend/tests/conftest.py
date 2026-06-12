import os
import asyncio
import contextlib

import httpx
import pytest
import pytest_asyncio
import websockets

import labelsourcing_utility as util

BASE_URL = os.environ.get("TEST_BASE_URL", "http://backend:8000")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


def ws_connect_url(token: str) -> str:
    return f"{WS_BASE}/utility/connect?token={token}"


@pytest_asyncio.fixture
async def client():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def user_cookie(client):
    r = await client.post("/auth/dev-login", params={"user": "admin"})
    assert r.status_code == 200
    return {"Cookie": f"access_token={r.cookies.get('access_token')}"}


@pytest_asyncio.fixture
async def paired_utility(client, user_cookie):
    r = await client.post("/utility/pairing-code", headers=user_cookie)
    code = r.json()["code"]
    r = await client.post("/utility/pair", json={"code": code, "name": "pytest"})
    data = r.json()
    yield data
    await client.delete(f"/utility/{data['utility_id']}", headers=user_cookie)


@pytest.fixture
def sample_root(tmp_path):
    root = tmp_path / "datasets"
    project = root / "projectA"
    project.mkdir(parents=True)
    (project / "a.png").write_bytes(b"\x89PNG\r\n\x1a\nA")
    (project / "b.jpg").write_bytes(b"\xff\xd8\xff\xe0B")
    (project / "notes.txt").write_text("ignore me")
    sub = project / "more"
    sub.mkdir()
    (sub / "c.png").write_bytes(b"\x89PNG\r\n\x1a\nC")
    return root


@contextlib.asynccontextmanager
async def fake_utility(token: str, roots, config_path):
    """Запускает реальные обработчики утилиты поверх WS-клиента."""
    os.environ["LABELSOURCING_UTILITY_CONFIG"] = str(config_path)
    cfg = {"token": token, "roots": [str(r) for r in roots], "mappings": {}}
    root_paths = [__import__("pathlib").Path(r) for r in cfg["roots"]]

    async with websockets.connect(ws_connect_url(token), max_size=None) as ws:
        async def loop():
            async for msg in ws:
                await util.handle_message(ws, cfg, root_paths, cfg["mappings"], msg)

        task = asyncio.create_task(loop())
        await asyncio.sleep(0.2)  # дать серверу зарегистрировать соединение
        try:
            yield cfg
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
