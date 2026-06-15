#!/usr/bin/env python3
import os
import sys
import json
import signal
import socket
import mimetypes
import argparse
import asyncio
import threading
import subprocess
from pathlib import Path
from urllib.parse import urlparse, unquote
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

import httpx
import websockets

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".avif"}

CONFIG_PATH = Path(
    os.environ.get("LABELSOURCING_UTILITY_CONFIG", Path.home() / ".labelsourcing" / "utility.json")
)
PID_PATH = CONFIG_PATH.parent / "utility.pid"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def save_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def require_paired(cfg: dict) -> None:
    if not cfg.get("token"):
        sys.exit("Утилита не привязана. Сначала: pair --server URL --code КОД")


def api_base(cfg: dict) -> str:
    return cfg["server"].rstrip("/") + "/api/v1"


def ws_url(cfg: dict) -> str:
    base = api_base(cfg)
    if base.startswith("https://"):
        base = "wss://" + base[len("https://"):]
    elif base.startswith("http://"):
        base = "ws://" + base[len("http://"):]
    return f"{base}/utility/connect?token={cfg['token']}"


def resolve_in_roots(roots: list[Path], target: str) -> Path | None:
    if not target:
        return None
    try:
        resolved = Path(target).resolve()
    except (OSError, ValueError):
        return None
    for root in roots:
        if resolved == root or root in resolved.parents:
            return resolved
    return None


def list_dirs(roots: list[Path], path: str) -> dict:
    if not path:
        return {
            "path": "",
            "parent": None,
            "dirs": [{"name": str(r), "path": str(r)} for r in roots],
            "image_count": 0,
        }
    base = resolve_in_roots(roots, path)
    if base is None or not base.is_dir():
        raise ValueError("Путь вне разрешённых корней")
    dirs = sorted(
        ({"name": p.name, "path": str(p)} for p in base.iterdir() if p.is_dir()),
        key=lambda d: d["name"].lower(),
    )
    image_count = sum(1 for p in base.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)
    parent = str(base.parent) if resolve_in_roots(roots, str(base.parent)) else None
    return {"path": str(base), "parent": parent, "dirs": dirs, "image_count": image_count}


def scan_folder(roots: list[Path], folder: str) -> tuple[str, list[str]]:
    base = resolve_in_roots(roots, folder)
    if base is None or not base.is_dir():
        raise ValueError("Путь вне разрешённых корней")
    paths = [
        p.relative_to(base).as_posix()
        for p in base.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    ]
    return str(base), paths


# ── commands ──

def cmd_pair(args) -> None:
    server = args.server.rstrip("/")
    name = args.name or socket.gethostname()
    resp = httpx.post(
        f"{server}/api/v1/utility/pair",
        json={"code": args.code, "name": name, "public_base_url": args.public_url},
        timeout=30.0,
    )
    if resp.status_code != 200:
        sys.exit(f"Ошибка привязки: {resp.status_code} {resp.text}")
    data = resp.json()
    cfg = load_config()
    cfg.update({
        "server": server,
        "utility_id": data["utility_id"],
        "token": data["token"],
        "public_base_url": args.public_url,
        "roots": cfg.get("roots", []),
        "mappings": cfg.get("mappings", {}),
    })
    save_config(cfg)
    print(f"Привязано. utility_id={data['utility_id']}")
    print(f"Конфиг: {CONFIG_PATH}")
    print("Дальше: start --root ПУТЬ_К_ПАПКЕ_С_ДАТАСЕТАМИ")


def cmd_list(args) -> None:
    cfg = load_config()
    if not cfg:
        print("Конфиг пуст. Выполните pair.")
        return
    token = cfg.get("token", "")
    print(f"Сервер:        {cfg.get('server')}")
    print(f"utility_id:    {cfg.get('utility_id')}")
    print(f"Публичный URL: {cfg.get('public_base_url') or '— (только через прокси)'}")
    print(f"Токен:         {'*' * 8 + token[-6:] if token else '—'}")
    roots = cfg.get("roots", [])
    print(f"Корни ({len(roots)}):")
    for r in roots:
        print(f"  {r}")


def cmd_start(args) -> None:
    cfg = load_config()
    require_paired(cfg)
    if args.root:
        cfg["roots"] = [str(Path(r).expanduser().resolve()) for r in args.root]
        save_config(cfg)
    if not cfg.get("roots"):
        sys.exit("Не заданы корни. Запустите: start --root ПУТЬ")

    if args.background:
        if PID_PATH.exists():
            sys.exit(f"Уже запущено (pid-файл {PID_PATH}). Сначала stop.")
        kwargs = {}
        if os.name == "nt":
            kwargs["creationflags"] = 0x00000008 | 0x00000200
        else:
            kwargs["start_new_session"] = True
        proc = subprocess.Popen(
            [sys.executable, os.path.abspath(__file__), "_run", "--port", str(args.port)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kwargs,
        )
        PID_PATH.write_text(str(proc.pid), encoding="utf-8")
        print(f"Запущено в фоне, pid={proc.pid}")
        return

    serve(cfg, args.port)


def cmd_stop(args) -> None:
    if not PID_PATH.exists():
        sys.exit("Фоновый процесс не найден")
    pid = int(PID_PATH.read_text(encoding="utf-8").strip())
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/F"], check=False)
        else:
            os.kill(pid, signal.SIGTERM)
    finally:
        PID_PATH.unlink(missing_ok=True)
    print(f"Остановлено (pid={pid})")


def _start_direct_server(cfg: dict, roots: list[Path], mappings: dict, port: int):
    if not cfg.get("public_base_url"):
        return None

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "private, max-age=3600")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.end_headers()

        def do_GET(self):
            parts = unquote(urlparse(self.path).path).strip("/").split("/", 1)
            if len(parts) != 2:
                self.send_error(404)
                return
            dataset_id, relpath = parts
            folder = mappings.get(dataset_id)
            if folder is None:
                self.send_error(404)
                return
            base = resolve_in_roots(roots, folder)
            target = (Path(folder) / relpath).resolve() if base else None
            if target is None or base not in target.parents or not target.is_file():
                self.send_error(404)
                return
            ct = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
            body = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ct)
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Direct HTTP сервер слушает :{port} (отдавайте наружу как {cfg['public_base_url']})")
    return server


def serve(cfg: dict, port: int) -> None:
    """Точка входа раздачи: чистая остановка по Ctrl+C / SIGTERM."""
    if os.name != "nt":
        signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        asyncio.run(run_agent(cfg, port))
    except KeyboardInterrupt:
        print("\nОстановлено.")


async def run_agent(cfg: dict, port: int) -> None:
    roots = [Path(r) for r in cfg.get("roots", [])]
    mappings: dict = cfg.get("mappings", {})
    server = _start_direct_server(cfg, roots, mappings, port)

    try:
        httpx.post(
            f"{api_base(cfg)}/utility/heartbeat",
            json={"public_base_url": cfg.get("public_base_url")},
            headers={"Authorization": f"Bearer {cfg['token']}"},
            timeout=15.0,
        )
    except Exception:
        pass

    print(f"Корни раздачи: {', '.join(str(r) for r in roots)} (Ctrl+C — выход)")
    backoff = 1
    try:
        while True:
            try:
                async with websockets.connect(ws_url(cfg), max_size=None, ping_interval=20) as ws:
                    print("Подключено к серверу. Управление — из веба.")
                    backoff = 1
                    async for message in ws:
                        await handle_message(ws, cfg, roots, mappings, message)
            except (OSError, websockets.WebSocketException) as e:
                print(f"Соединение потеряно ({e}). Переподключение через {backoff}с…")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
    finally:
        if server is not None:
            server.shutdown()


async def handle_message(ws, cfg: dict, roots: list[Path], mappings: dict, message) -> None:
    if isinstance(message, bytes):
        return
    try:
        data = json.loads(message)
    except json.JSONDecodeError:
        return
    mtype = data.get("type")
    req_id = data.get("req_id", "")

    async def ok(payload: dict):
        await ws.send(json.dumps({"type": "response", "req_id": req_id, "ok": True, "data": payload}))

    async def fail(status: int, error: str):
        await ws.send(json.dumps({"type": "response", "req_id": req_id, "ok": False, "status": status, "error": error}))

    if mtype == "list_dirs":
        try:
            await ok(await asyncio.to_thread(list_dirs, roots, data.get("path", "")))
        except ValueError as e:
            await fail(400, str(e))

    elif mtype == "scan":
        try:
            folder, paths = await asyncio.to_thread(scan_folder, roots, data["path"])
            mappings[data["dataset_id"]] = folder
            cfg["mappings"] = mappings
            await asyncio.to_thread(save_config, cfg)
            await ok({"folder": folder, "paths": paths})
        except ValueError as e:
            await fail(400, str(e))

    elif mtype == "fetch":
        folder = data.get("folder", "")
        path = data.get("path", "")
        base = resolve_in_roots(roots, folder)
        target = (Path(folder) / path).resolve() if base else None
        if target is None or base not in target.parents or not target.is_file():
            await ws.send(json.dumps({"type": "error", "req_id": req_id, "status": 404}))
            return
        ct = (mimetypes.guess_type(str(target))[0] or "application/octet-stream").encode("ascii")
        body = await asyncio.to_thread(target.read_bytes)
        await ws.send(req_id.encode("ascii") + bytes([len(ct)]) + ct + body)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="labelsourcing-utility", description="Локальная утилита раздачи изображений LabelSourcing")
    sub = p.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("pair", help="Привязать утилиту к аккаунту по коду")
    sp.add_argument("--server", required=True, help="Адрес сайта, напр. https://labelsourcing.ru")
    sp.add_argument("--code", required=True, help="Код привязки из веба (профиль)")
    sp.add_argument("--name", help="Имя утилиты (по умолчанию имя машины)")
    sp.add_argument("--public-url", help="Публичный HTTPS-адрес для direct-режима")
    sp.set_defaults(func=cmd_pair)

    sp = sub.add_parser("start", help="Запустить раздачу (всё дальше — из веба)")
    sp.add_argument("--root", action="append", help="Корневая папка (можно несколько). Внутри неё веб выбирает датасеты")
    sp.add_argument("--port", type=int, default=8077, help="Порт direct HTTP-сервера")
    sp.add_argument("--background", action="store_true", help="Запустить в фоне")
    sp.set_defaults(func=cmd_start)

    sp = sub.add_parser("stop", help="Остановить фоновую раздачу")
    sp.set_defaults(func=cmd_stop)

    sp = sub.add_parser("list", help="Показать конфигурацию")
    sp.set_defaults(func=cmd_list)

    sp = sub.add_parser("_run", help=argparse.SUPPRESS)
    sp.add_argument("--port", type=int, default=8077)
    sp.set_defaults(func=lambda a: serve(load_config(), a.port))

    return p


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
