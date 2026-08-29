# LabelSourcing

Краудсорсинговая платформа разметки данных. Сейчас в фокусе — изображения (bbox и полигоны),
архитектура рассчитана на добавление других типов данных. Есть пайплайн валидации чужой разметки
и доставка картинок как по прямым ссылкам, так и с локальных машин модераторов за NAT.

## Документация

| Документ | О чём |
|---|---|
| [RUNNING.md](RUNNING.md) | Запуск (Docker и локально), окружение, деплой |
| [backend/BACKEND.md](backend/BACKEND.md) | Архитектура бэкенда: модель данных, процессы, источники, экспорт |
| [backend/COCO_EXPORT.md](backend/COCO_EXPORT.md) | Формат выгрузки разметки (COCO-подобный) |
| [frontend/FRONTEND.md](frontend/FRONTEND.md) | Архитектура фронтенда: сервисы, страницы, холст разметки, переменные окружения |
| [utility/README.md](utility/README.md) | Локальная утилита раздачи изображений |
| [BACKLOG.md](BACKLOG.md) | Бэклог задач |

## Стек

- **Backend:** FastAPI, SQLAlchemy 2.0 (async) + asyncpg, Alembic, PostgreSQL.
- **Frontend:** React 19 + TypeScript, Vite, Annotorious, react-router-dom v7.
- **Инфраструктура:** Docker Compose, nginx; продакшн — Yandex Cloud (образы в CR, деплой из GitHub Actions).

Быстрый старт: `docker compose up -d --build` → <http://localhost>. Подробности — в [RUNNING.md](RUNNING.md).
