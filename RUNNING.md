# Запуск LabelSourcing

Памятка по локальному запуску и продакшн-деплою. Подробности — в
[backend/BACKEND.md](backend/BACKEND.md), [frontend/FRONTEND.md](frontend/FRONTEND.md),
[utility/README.md](utility/README.md).

---

## Компоненты системы

| Сервис | Что это | Порт (локально) |
|---|---|---|
| `db` | PostgreSQL 15 | 5432 (внутри compose) |
| `migrate` | Разовый прогон `alembic upgrade head` перед стартом бэкенда | — |
| `backend` | FastAPI (`/api/v1`) | 8000 |
| `nginx` | Отдаёт собранный фронтенд и проксирует `/api` на бэкенд | 80 |
| утилита | CLI на машине модератора, раздаёт локальные картинки (опционально) | 8077 |

Наружу торчит только nginx.

---

## Быстрый старт (Docker)

Основной способ запуска. Нужен Docker с плагином Compose.

1. Создай `backend/.env` (файл в `.gitignore`, переменные ниже).
2. Из корня репозитория:
   ```bash
   docker compose up -d --build
   ```
3. Открой http://localhost.

Порядок старта: `db` (ждёт healthcheck), затем `migrate` (применяет миграции), затем `backend`,
затем `nginx`.

### `backend/.env`

```dotenv
DATABASE_URL=postgresql+asyncpg://test:test@db:5432/testdb
SECRET_KEY=<любая-длинная-строка>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

YANDEX_CLIENT_ID=<...>
YANDEX_CLIENT_SECRET=<...>
YANDEX_REDIRECT_URI=http://localhost/api/v1/auth/yandex/callback

DEV_MODE=true
```

Хост БД в `DATABASE_URL` — это имя сервиса `db` (в docker-compose пользователь/пароль/база —
`test`/`test`/`testdb`). Чтобы входить без Яндекс OAuth, поставь `DEV_MODE=true` (см. ниже).

### Build-аргументы фронтенда

Образ nginx собирается из `frontend/` с двумя build-аргументами:

| Аргумент | Дефолт | Кратко |
|---|---|---|
| `VITE_API_MODE` | `real` | `real` — работать с настоящим бэкендом; `mock` — заглушки без бэкенда |
| `VITE_DEV_PANEL` | `true` | Показывать DEV-инструменты в UI (быстрый вход, редактор сырых настроек) |

Полное описание всех переменных фронтенда — в
[frontend/FRONTEND.md, раздел 2](frontend/FRONTEND.md#2-конфигурация-и-переменные-окружения).
Переопределяются через окружение:
```bash
VITE_API_MODE=real VITE_DEV_PANEL=true docker compose up -d --build
```

---

## DEV-вход без OAuth

При `DEV_MODE=true` доступен `POST /api/v1/auth/dev-login?user=<preset>` с готовыми пользователями:

| preset | Роли |
|---|---|
| `admin` | `admin` |
| `annotator-1` | нет (обычный исполнитель) |
| `annotator-2` | нет |

Во фронтенде это панель DEV на странице входа (при `VITE_DEV_PANEL=true`). Удобно проверять
сценарии «разметчик и валидатор» под разными аккаунтами.

---

## Фронтенд отдельно (dev-сервер Vite)

```bash
cd frontend
npm install
npm run dev
```
- Против реального бэкенда: задай `VITE_API_URL` (например, `http://localhost`) в `frontend/.env`.
- Без бэкенда: `VITE_API_MODE=mock` — подставятся mock-реализации сервисов.

Внимание: этот способ давно не проверялся и может подтормаживать или вести себя неожиданно
(устаревшие зависимости, расхождения окружения). Штатный запуск — через Docker. Если dev-сервер
не заводится, начни с переустановки зависимостей (`rm -rf node_modules && npm install`).

Миграции БД (при работе с бэкендом напрямую):
```bash
cd backend
alembic upgrade head                               # применить
alembic revision --autogenerate -m "описание"      # сгенерировать по изменениям models.py
```

---

## Локальная утилита (раздача картинок за NAT)

Опционально, для датасетов с `source_type=utility`. Полностью описана в
[utility/README.md](utility/README.md). Кратко:

```bash
cd utility
pip install -r requirements.txt
python labelsourcing_utility.py pair --server https://<сайт> --code <КОД-из-веба>
python labelsourcing_utility.py start --root "C:\datasets"
```
Дальше выбор папок и создание датасетов делаются из веб-интерфейса (профиль, раздел «Утилиты»).

---

## Продакшн

Деплой автоматический — GitHub Actions `.github/workflows/deploy.yml` при push в `main`
(по изменениям в `frontend/`, `backend/`, `nginx/`, `docker-compose.prod.yml`).

Пайплайн:
1. Собирает и пушит образы `labelsourcing-backend` и `labelsourcing-frontend` в Yandex Container Registry.
2. Поднимает VM, копирует `docker-compose.prod.yml` и `nginx/`, прогоняет `alembic upgrade head`,
   перезапускает стек.

Чем `docker-compose.prod.yml` отличается от локального:
- образы тянутся из реестра, а не собираются на месте; БД — на volume `pgdata`;
- nginx слушает 80 и 443, TLS через `certbot` (Let's Encrypt, автопродление);
- все секреты и параметры БД приходят из окружения (GitHub Secrets), а не из `.env`.

Важно про масштабирование: реестр WebSocket-соединений утилит хранится в оперативной памяти
одного процесса бэкенда. Если запустить uvicorn с несколькими воркерами, запрос за картинкой может
попасть в воркер, который не держит нужное соединение, и отдача файла сорвётся. Поэтому прод-бэкенд
работает одним воркером uvicorn. Подробнее — в
[backend/BACKEND.md, раздел 7.4](backend/BACKEND.md#74-подсистема-утилиты).
