# Backend — LabelSourcing

Бэкенд краудсорсинговой платформы разметки данных. Отвечает за аккаунты и роли,
датасеты и задачи, выдачу задач исполнителям, приём разметки, пайплайн валидации,
источники изображений (прямые ссылки и локальные утилиты за NAT) и экспорт.

Интерактивный справочник по всем эндпоинтам — Swagger UI на `/api/v1/docs`
(и ReDoc на `/api/v1/redoc`). Этот документ описывает то, чего в Swagger нет:
бизнес-логику, побочные эффекты и инварианты состояний.

---

## 1. Стек

| Технология | Роль |
|---|---|
| FastAPI | HTTP-слой, DI, авто-Swagger. `root_path = /api/v1` |
| SQLAlchemy 2.0 (async) + asyncpg | ORM и драйвер PostgreSQL |
| Alembic | Миграции схемы |
| python-jose | JWT (access/refresh) |
| bcrypt | Хеширование паролей и токенов утилит |
| httpx | HTTP-клиент (Яндекс OAuth, проксирование картинок по URL) |
| websockets (FastAPI WS) | Туннель к локальным утилитам |

Схема БД поднимается только через Alembic — `create_all` в `lifespan` отключён
намеренно (см. `app/main.py`).

---

## 2. Структура проекта

```
backend/
├── app/
│   ├── main.py                # Точка входа FastAPI: подключение роутеров, CORS, /health
│   ├── database.py            # Async-движок и сессии (get_db)
│   ├── models.py              # Все ORM-модели и Enum-ы
│   ├── core/
│   │   ├── config.py          # Settings (pydantic-settings, читает .env)
│   │   └── security.py        # bcrypt-хеши, генерация JWT
│   ├── api/
│   │   ├── dependencies.py    # get_current_user, require_roles, refresh-токен
│   │   ├── helpers.py         # Общая логика: права на датасет, создание validation-задач
│   │   ├── utility_manager.py # Реестр WS-соединений утилит, токены утилит
│   │   └── routers/           # auth, users, datasets, tasks, labels, tags, sources, proxy, utility
│   └── schemas/               # Pydantic-схемы запросов/ответов
├── alembic/                   # Миграции (versions/*)
├── tests/                     # pytest
├── requirements.txt           # Прод-зависимости
├── requirements-dev.txt       # + тестовые
└── Dockerfile
```

---

## 3. Конфигурация (`.env`)

Читается классом `Settings` (`app/core/config.py`). Лишние переменные игнорируются.

| Переменная | Обяз. | По умолчанию | Назначение |
|---|---|---|---|
| `DATABASE_URL` | да | — | Async-строка подключения (`postgresql+asyncpg://…`) |
| `SECRET_KEY` | да | — | Ключ подписи JWT |
| `ALGORITHM` | нет | `HS256` | Алгоритм JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | нет | `1440` (24 ч) | Время жизни access-токена |
| `YANDEX_CLIENT_ID` | да | — | Яндекс OAuth |
| `YANDEX_CLIENT_SECRET` | да | — | Яндекс OAuth |
| `YANDEX_REDIRECT_URI` | да | — | Callback OAuth |
| `DEV_MODE` | нет | `false` | Включает `POST /auth/dev-login` (быстрый вход без OAuth) |

Refresh-токен живёт `ACCESS_TOKEN_EXPIRE_MINUTES + 2 дня`.

---

## 4. Модель данных

### 4.1. Enum-ы

| Enum | Значения | Комментарий |
|---|---|---|
| `AssignmentStatus` | `in_progress`, `done` | Истёкшие/отклонённые назначения удаляются, отдельных статусов нет |
| `TaskStatus` | `pending`, `completed` | |
| `TaskType` | `annotation`, `validation` | validation-задачи создаются автоматически |
| `DatasetStatus` | `active`, `closed` | `closed` = «завершён администратором» |
| `SourceType` | `url`, `utility` | Откуда берутся изображения |

### 4.2. Таблицы

Каждая таблица описана отдельным блоком ниже.

#### users

Пользователи. `id`, `email` (unique), `password` (bcrypt-хеш), `name`, `avatar_url`, `created_at`.
Связи: роли (M2M через `user_roles`), теги (M2M через `user_tags`), собственные датасеты,
ассайнменты, доступы к датасетам, утилиты. Пользователь без ролей — обычный исполнитель.

#### roles / user_roles

Роли (`admin`, `moderator`, …) и их связь с пользователями (many-to-many).

#### datasets

Проект разметки:
- `owner_id`, `title`, `description`, `created_at`
- `required_answers` — кворум ответов на annotation-задачу (дефолт 3)
- `default_tasks_limit` — квота задач для нового пользователя (дефолт 50)
- `status` — `active` / `closed`
- `tasks_count` — денормализованный счётчик, учитывает только annotation-задачи
- `requires_validation` (bool), `validation_quorum` — кворум валидаторов (дефолт 1)
- `settings` (JSONB, см. раздел 4.3)
- `source_type` (`url` / `utility`), `utility_id`, `utility_folder`

#### tasks

Единица работы:
- `dataset_id`, `url`, `type` (`annotation` / `validation`)
- `completed_answers`, `active_assignments`, `status`
- `metadata` (JSONB; атрибут ORM называется `task_metadata`, потому что имя `metadata` занято
  SQLAlchemy). Для validation-задач хранит
  `{annotation_task_id, annotation_label_id, annotator_id, annotations}`

#### assignments

«Задача в руках у пользователя». Ограничение `UNIQUE (task_id, user_id)`.
Поля: `status`, `assigned_at`, `expires_at`.
Живой ассайнмент = `in_progress` И `expires_at > now()`.

#### labels

Результат работы. `assignment_id` (unique), `result` (JSONB), `is_validated` (прошла ли
валидацию), `created_at`.
- annotation: `{"result": [ {shape: 'rectangle'|'polygon', …, tag} ]}`
- validation: `{"is_correct": true|false}`

#### tags / user_tags / dataset_tags

Теги и их связи с пользователями и датасетами. Теги работают как метки доступа (см. раздел 5.3).

#### user_dataset_access

Состояние пары пользователь-датасет. Составной первичный ключ `(user_id, dataset_id)`.
`tasks_limit` (персональная квота), `tasks_done` (выполнено), `can_label` (право на разметку).

#### utilities

Локальная утилита модератора: `owner_id`, `name`, `token_hash` (bcrypt-хеш секрета токена),
`public_base_url` (для direct-режима), `last_seen_at`, `created_at`.

#### utility_pairing_codes

Одноразовый код привязки утилиты. Первичный ключ — сам код; `user_id`, `expires_at`.

### 4.3. `dataset.settings` (JSONB)

Гибкие настройки датасета без изменения схемы:

| Ключ | Тип | Назначение |
|---|---|---|
| `annotation_labels` | `[{id, label, color, hotkey?}]` | Метки (классы) для разметки. Дефолт: `[{id:"object", label:"Object", color:"#f59e0b"}]` |
| `allowed_tools` | `["rectangle", "polygon"]` | Разрешённые инструменты. Проверяется при приёме разметки |
| `annotation_instructions` | `string` | Текст-инструкция для исполнителя |
| `use_proxy` | `bool` (дефолт `true`) | Гнать картинки через наш прокси или напрямую (см. раздел 7) |

---

## 5. Аутентификация и доступ

### 5.1. Токены и cookie

JWT кладутся в httpOnly-cookie (`secure`, `samesite=lax`):
- `access_token` — `{sub: user_id, type: "access", exp}`
- `refresh_token` — `{sub, type: "refresh", exp}`, живёт дольше

`get_current_user` (`dependencies.py`) достаёт токен из cookie `access_token`, а если его нет —
из заголовка `Authorization: Bearer`. Требует `type == "access"`, подгружает роли и теги.

При истёкшем access фронтенд дёргает `POST /auth/refresh` (по refresh-cookie) — выдаётся новая пара.

Cookie помечены `secure`, поэтому работают по HTTPS (и по `http://localhost`, который браузеры
считают безопасным контекстом).

### 5.2. Способы входа

| Эндпоинт | Что делает |
|---|---|
| `POST /auth/login` | Форма `username` + `password` (OAuth2PasswordRequestForm), ставит cookie. На текущем фронтенде не используется — вход только через Яндекс |
| `GET /auth/yandex/login`, затем `GET /auth/yandex/callback` | Яндекс OAuth. Первый вход создаёт пользователя, повторный обновляет имя/аватар |
| `POST /auth/dev-login?user=admin\|annotator-1\|annotator-2` | Только при `DEV_MODE=true`. Создаёт/логинит преднастроенного пользователя |
| `POST /auth/refresh` | Обновляет пару токенов по refresh-cookie |
| `POST /auth/logout` | Удаляет cookie |

### 5.3. Роли и права

- `admin` — полный доступ ко всему.
- `moderator` — управляет своими датасетами (как владелец).
- Проверка «может управлять датасетом» — `ensure_can_manage_dataset()`: админ (любым) или
  владелец (своим). Иначе `403`.
- Доступ исполнителя к датасету регулируется тегами. Правило (`_check_dataset_access`): если у
  датасета есть теги, пользователь должен обладать всеми тегами датасета. Датасет без тегов
  доступен всем. Админ проверку игнорирует.
- Право на разметку внутри датасета — флаг `access.can_label`. Отдельного флага на валидацию нет:
  валидировать может любой, у кого есть доступ к датасету и кто не является автором данной
  разметки (см. раздел 6.3).

---

## 6. Ключевые процессы (не видны в Swagger)

### 6.1. Выдача задач — `GET /datasets/{id}/next?count=N`

Центральный метод рабочего цикла. Бронирует и возвращает до `N` задач.
Типы не смешиваются: сначала пытается выдать validation, если их нет — annotation.

Алгоритм:
1. Загружает датасет (с тегами и утилитой). `404` если нет. Проверяет доступ по тегам.
2. Решает режим отдачи картинок (proxy/direct, см. раздел 7).
3. Восстановление сессии. Если у пользователя есть живые ассайнменты (`in_progress`,
   `expires_at > now()`) — возвращает их же, не выдавая новые. Делает запрос идемпотентным при
   перезагрузке страницы.
4. Upsert `user_dataset_access` (`tasks_limit = dataset.default_tasks_limit`), `ON CONFLICT DO NOTHING`.
5. Validation в приоритете (если `requires_validation` и квота не исчерпана): берёт `pending`
   validation-задачи, где `живые_ассайнменты + completed_answers < validation_quorum`, пользователь
   не занят и не автор (`task_metadata.annotator_id != user`).
6. Annotation (только если validation не нашлось, есть `can_label` и квота не исчерпана): берёт
   `pending` annotation-задачи, где `живые + completed_answers < required_answers`, пользователь не занят.
7. Выбор задач — `SELECT … FOR UPDATE SKIP LOCKED`: параллельные запросы не возьмут одну задачу.
8. `_assign_task`: если остался устаревший `in_progress`-ассайнмент — обновляет его (обход
   `UNIQUE(task_id, user_id)`), иначе создаёт новый и `active_assignments += 1`.
   Дедлайн — `now + 10 минут`.
9. Если ничего не нашлось — `rollback`, возвращает `[]`.

### 6.2. Приём разметки — `PUT /tasks/{id}/labels`

Один эндпоинт и для разметки, и для вердикта валидации. Тело — `{data: …}`.

1. Ищет ассайнмент `in_progress` или `done` для `(task, user)`. Нет — `400`.
2. Блокирует задачу `FOR UPDATE`.
3. Ленивое истечение: если ассайнмент `in_progress` и `expires_at < now()` — удаляет его,
   `active_assignments -= 1`, отвечает `410 Gone`.
4. Повторная отправка запрещена: если label уже есть — `409` (перезаписи нет).
5. Для annotation-задач проверяются разрешённые инструменты (см. ниже).
6. Создаёт `Label`. Если ассайнмент был `in_progress`: переводит в `done`, `active_assignments -= 1`,
   `completed_answers += 1`, `access.tasks_done += 1`.
7. Кворум: `validation_quorum` для validation-задач, иначе `required_answers`. При достижении —
   `status = completed`.
8. Если это annotation-задача с `requires_validation` и достигнут `required_answers` — создаются
   validation-задачи (`_ensure_validation_tasks`). Если это validation-задача и достигнут кворум —
   обрабатывается вердикт (см. раздел 6.3).

Проверка разрешённых инструментов (шаг 5). Тело разметки — `data.result`, это массив фигур; у
каждой фигуры есть поле `shape` со значением `rectangle` или `polygon`. Если у датасета в
`settings.allowed_tools` задан непустой список (например, `["rectangle"]`), то любая фигура,
чей `shape` не входит в этот список, отклоняется с `400`. Если `allowed_tools` не задан —
разрешены все инструменты.

### 6.3. Пайплайн валидации

Создание validation-задач (`helpers._ensure_validation_tasks`): для каждой `done`-разметки
завершённой annotation-задачи создаётся validation-задача с копией геометрии в `task_metadata`.
Дедупликация по `annotation_label_id` — функцию безопасно вызывать повторно. `tasks_count` при
этом не растёт (квоты и счётчик касаются только annotation-задач).

Вердикт (`tasks._process_validation_verdict`) при наборе `validation_quorum` голосов:
- Считает голоса `is_correct` среди `done`-разметок валидаторов.
- Разметка одобряется (`label.is_validated = True`) только при большинстве «за» — голосов «за»
  строго больше, чем «против».
- Иначе (в том числе при равенстве голосов) — откат: исходная разметка и её ассайнмент удаляются,
  `completed_answers -= 1` (задача может вернуться в `pending`), автору возвращается слот квоты
  (`access.tasks_done -= 1`).

Запрет самовалидации действует на всех уровнях: и при выдаче (шаг 6.1.5), и в списке датасетов
`annotator_id` сравнивается с текущим пользователем.

### 6.4. Изменение датасета — побочные эффекты (`PATCH /datasets/{id}`)

- Снижение `required_answers`: задачи, «застрявшие» в `pending` с уже набранным новым порогом,
  переводятся в `completed` (и создаются validation-задачи, если валидация включена).
- Включение `requires_validation`: для всех уже `completed` annotation-задач создаются
  validation-задачи.
- Изменение `default_tasks_limit`: каскадно обновляет `tasks_limit` у всех существующих записей
  доступа этого датасета.

### 6.5. Инварианты состояний

- `task.status = completed` тогда и только тогда, когда `completed_answers >= кворум`.
- `active_assignments` = число живых `in_progress`-ассайнментов (ведётся вручную: +1 при выдаче,
  −1 при сдаче/истечении).
- `access.tasks_done` растёт при первой сдаче задачи; при откате валидации или удалении
  annotation-задачи корректно уменьшается.
- Живые ассайнменты делают `GET /next` идемпотентным.
- Счётчик `dataset.tasks_count` учитывает только annotation-задачи.

---

## 7. Источники изображений

### 7.1. Кто и как отдаёт картинку

Аннотатору картинку никогда не отдают просто внешней ссылкой без выбора — сервер решает, как её
доставить, через поле `url` в ответе `/next` (`TaskPublicResponse`):

- `url` — строка: браузер грузит картинку по этому адресу сам (режим direct).
- `url = null`: браузер идёт на `GET /proxy/{task_id}`, и картинку ему отдаёт наш сервер (режим proxy).

Какой режим выбрать, решает `/next` из настройки `settings.use_proxy` (дефолт `true`) и типа
источника (`source_type`).

### 7.2. Четыре комбинации «источник × режим»

| Источник | Режим proxy (`use_proxy=true`) | Режим direct (`use_proxy=false`) |
|---|---|---|
| URL (`source_type=url`) | Сервер сам скачивает картинку по http(s) через httpx и стримит браузеру. Оригинальный адрес источника браузеру не виден | Браузер получает прямой `task.url` и грузит с источника напрямую |
| Utility (`source_type=utility`) | Сервер запрашивает файл у локальной утилиты по WebSocket-туннелю и стримит браузеру | Доступен только если у утилиты задан `public_base_url`. Тогда браузер идёт напрямую на `public_base_url/{dataset_id}/{относительный_путь}`. Если публичного адреса нет — принудительно proxy |

### 7.3. Прокси — `GET /proxy/{task_id}`

Единая точка доставки картинок в режиме proxy (роутер `proxy.py`):
- для URL-датасета — качает upstream через httpx;
- для utility-датасета — зовёт `manager.fetch_file()` (тянет файл у утилиты по WS).

Отдаёт с заголовком `Cache-Control: private, max-age=3600`.

### 7.4. Подсистема утилиты

Задача подсистемы — раздавать картинки, лежащие на машине модератора за NAT, не заливая их на
сервер. Утилита сама открывает исходящее WebSocket-соединение к серверу; дальше данные идут по
цепочке: утилита → сервер → браузер.

Жизненный цикл:
1. Привязка. Пользователь в вебе генерирует одноразовый код (`POST /utility/pairing-code`) и
   вводит его в CLI-утилиту. Утилита меняет код на долгоживущий токен (`POST /utility/pair`).
   Токен имеет вид `<utility_id>.<секрет>`; в БД хранится только bcrypt-хеш секрета.
2. Соединение. Утилита подключается к `WS /utility/connect?token=…`. Менеджер соединений
   (`utility_manager.py`) держит реестр живых подключений и коррелирует пары запрос/ответ по `req_id`.
3. Управление из веба (только владелец утилиты): `GET /utility/{id}/dirs` — файловый браузер в
   пределах разрешённых корней; `POST /utility/{id}/scan` — привязать папку к датасету и создать
   задачи из её файлов; `POST /utility/{id}/rescan/{dataset_id}` — догрузить новые файлы.
4. Отдача файла. `/proxy` вызывает `manager.fetch_file()`, тот шлёт в WS команду `{type: fetch}`,
   а утилита возвращает бинарный кадр:
   `req_id (32 байта) + длина content-type (1 байт) + content-type + тело файла`.

Ограничение по масштабированию. Менеджер хранит активные WebSocket-подключения и «ожидающие»
ответа запросы в обычном словаре в оперативной памяти одного процесса. Если запустить uvicorn с
несколькими воркерами (процессами), запрос за картинкой, попавший в воркер A, не найдёт
WebSocket-подключение утилиты, которое держит воркер B, и отдача файла сорвётся. Поэтому
прод-бэкенд запускается одним воркером uvicorn. Горизонтальное масштабирование потребует внешнего
брокера (например, Redis) для маршрутизации сообщений между воркерами.

Подробная инструкция по установке и запуску самой утилиты — в `utility/README.md`.

---

## 8. Экспорт разметки

`GET /datasets/{id}/export/coco` выгружает разметку в формате, близком к COCO.
Полное описание формата, что попадает в выгрузку и почему координаты нормализованы (а не в
пикселях) — в отдельном документе `backend/COCO_EXPORT.md`.

---

## 9. Служебные и DEV-операции

Эндпоинты ниже нужны для тестирования и обслуживания, а не для обычной работы. Помеченные `[DEV]`
меняют данные необратимо и позволяют быстро сбросить состояние датасета или пользователя между
прогонами.

| Эндпоинт | Доступ | Назначение |
|---|---|---|
| `GET /datasets/{id}/stats` | админ/владелец | Счётчики по типам/статусам и текущая `phase` (`labeling` / `labeling_and_validation` / `validation` / `complete`) |
| `PATCH /labels/{id}/status` | admin/moderator | Ручная смена статуса ассайнмента (`in_progress`/`done`) через его label |
| `DELETE /datasets/{id}/progress/{user_id}` | админ/владелец | `[DEV]` Сброс прогресса одного пользователя по датасету |
| `DELETE /datasets/{id}/users-data` | admin | `[DEV]` Сброс всех пользовательских данных: датасет становится «как новый», annotation-задачи сохраняются |
| `GET /sources/` | admin | Заглушка (возвращает `[]`), задел под конфигурацию источников |

---

## 10. Миграции и тесты

Alembic. Схема ведётся миграциями в `alembic/versions/`.
```bash
alembic upgrade head                               # применить все миграции
alembic revision --autogenerate -m "описание"      # создать новую по изменениям models.py
```
В docker-compose это делает отдельный сервис `migrate` перед стартом бэкенда.

Тесты. `pytest` (конфиг `pytest.ini`, фикстуры `tests/conftest.py`). Покрыты авторизация и фильтры
по ролям, а также подсистема утилиты (unit и integration).
```bash
pip install -r requirements-dev.txt
pytest
```
