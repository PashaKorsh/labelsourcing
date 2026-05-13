"""
LabelSourcing Local Agent

Порядок работы:
  1. В профиле сайта получить код сопряжения.
  2. pair — привязать утилиту к аккаунту (без привязки к папке).
  3. serve — держать процесс запущенным (отдаёт файлы по запросам бэкенда).
  4. В веб-интерфейсе создать датасет с источником «локальный агент» и выбрать этого агента.
  5. sync — для каждого датасета указать папку на диске и отправить список файлов на сервер.

Команды:
  python agent.py pair <server_url> <pairing_code> <public_url> [--name NAME]
  python agent.py sync <dataset_id> [folder]
  python agent.py serve [--port 8765]
  python agent.py status

Пример:
  python agent.py pair https://labelsourcing.example.com A3F7K2X4 http://203.0.113.1:8765
  python agent.py serve
  python agent.py sync 550e8400-e29b-41d4-a716-446655440000 ./photos/cats
"""

import argparse
import json
import sys
import uuid
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

CONFIG_FILE = Path.home() / ".labelsourcing-agent.json"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"}


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        return {}
    return json.loads(CONFIG_FILE.read_text())


def save_config(cfg: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))


def require_agent_credentials() -> dict:
    cfg = load_config()
    if not cfg.get("device_token") or not cfg.get("agent_id"):
        print("Агент не настроен. Сначала выполните команду 'pair'.")
        sys.exit(1)
    if "dataset_roots" not in cfg or not isinstance(cfg["dataset_roots"], dict):
        cfg["dataset_roots"] = {}
    return cfg


# --- Команды CLI ---

def cmd_pair(args: argparse.Namespace) -> None:
    server_url = args.server_url.rstrip("/")

    resp = httpx.post(
        f"{server_url}/api/v1/agents/pair",
        json={
            "code": args.pairing_code,
            "name": args.name,
            "base_url": args.public_url.rstrip("/"),
        },
    )
    resp.raise_for_status()
    data = resp.json()

    save_config({
        "server_url": server_url,
        "agent_id": data["agent_id"],
        "device_token": data["device_token"],
        "public_url": args.public_url.rstrip("/"),
        "dataset_roots": {},
    })
    print("Сопряжение выполнено успешно.")
    print(f"  Agent ID:  {data['agent_id']}")
    print("  Дальше: запустите «serve», создайте датасет в веб-интерфейсе, затем «sync <id_датасета> <папка>».")


def cmd_sync(args: argparse.Namespace) -> None:
    cfg = require_agent_credentials()
    try:
        dataset_id = str(uuid.UUID(args.dataset_id))
    except ValueError:
        print("Некорректный UUID датасета.")
        sys.exit(1)

    folder = Path(args.folder).resolve()
    if not folder.is_dir():
        print(f"Не каталог: {folder}")
        sys.exit(1)

    files = [
        {"path": str(f.relative_to(folder)).replace("\\", "/")}
        for f in sorted(folder.rglob("*"))
        if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS
    ]

    if not files:
        print(f"В папке {folder} не найдено изображений.")
        return

    cfg["dataset_roots"][dataset_id] = str(folder)
    save_config(cfg)

    resp = httpx.post(
        f"{cfg['server_url']}/api/v1/agents/{cfg['agent_id']}/datasets/{dataset_id}/sync",
        json={"files": files},
        headers={"Authorization": f"Bearer {cfg['device_token']}"},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    print(f"Синхронизация датасета {data['dataset_id']}")
    print(f"  Принято задач: {data['accepted']}")
    print(f"  Локальная папка: {folder}")


def cmd_status(args: argparse.Namespace) -> None:
    cfg = load_config()
    if not cfg.get("device_token"):
        print("Агент не настроен.")
        return
    print(f"Server:     {cfg.get('server_url')}")
    print(f"Agent ID:   {cfg.get('agent_id')}")
    print(f"Public URL: {cfg.get('public_url')}")
    roots = cfg.get("dataset_roots") or {}
    if not roots:
        print("Папки датасетов: (ещё не настроены — выполните sync)")
    else:
        print("Папки датасетов:")
        for ds_id, path in roots.items():
            print(f"  {ds_id}  →  {path}")


def cmd_serve(args: argparse.Namespace) -> None:
    cfg = require_agent_credentials()

    app = FastAPI(docs_url=None, redoc_url=None)

    # Файлы публично отдаются по ссылке: бэкенд только формирует URL, а браузер
    # пользователя качает картинку напрямую с агента. Поэтому нужен открытый CORS.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/datasets/{dataset_id}/files/{file_path:path}")
    async def serve_dataset_file(dataset_id: str, file_path: str):
        roots = load_config().get("dataset_roots") or {}
        root_raw = roots.get(dataset_id)
        if not root_raw:
            raise HTTPException(status_code=404, detail="Dataset folder not registered on this agent")
        root = Path(root_raw).resolve()

        target = (root / file_path).resolve()
        if not str(target).startswith(str(root)):
            raise HTTPException(status_code=400, detail="Invalid path")
        if not target.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(str(target))

    print("Агент запущен.")
    print(f"  Порт:       {args.port}")
    print(f"  Public URL: {cfg.get('public_url', 'не указан')}")
    roots_n = len(load_config().get("dataset_roots") or {})
    print(f"  Зарегистрировано датасетов: {roots_n}")
    uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="warning")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="LabelSourcing Local Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("pair", help="Привязать агент к аккаунту")
    p.add_argument("server_url", help="URL сервера, напр. https://labelsourcing.example.com")
    p.add_argument("pairing_code", help="Код сопряжения из веб-интерфейса")
    p.add_argument("public_url", help="Публичный URL этого агента, напр. http://203.0.113.1:8765")
    p.add_argument("--name", default="Local Agent", help="Имя агента")

    p = sub.add_parser("sync", help="Загрузить список файлов датасета с диска (датасет создаётся в веб-интерфейсе)")
    p.add_argument("dataset_id", help="UUID датасета с сайта")
    p.add_argument(
        "folder",
        nargs="?",
        default=".",
        help="Папка с изображениями (по умолчанию: текущая)",
    )

    p = sub.add_parser("serve", help="Запустить веб-сервер отдачи файлов")
    p.add_argument("--port", type=int, default=8765, help="Порт (по умолчанию: 8765)")

    sub.add_parser("status", help="Показать текущую конфигурацию")

    args = parser.parse_args()

    commands = {
        "pair": cmd_pair,
        "sync": cmd_sync,
        "serve": cmd_serve,
        "status": cmd_status,
    }
    try:
        commands[args.command](args)
    except httpx.HTTPStatusError as e:
        print(f"Ошибка сервера {e.response.status_code}: {e.response.text}")
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"Не удалось подключиться к серверу: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
