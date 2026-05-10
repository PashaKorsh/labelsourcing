# Документация бэкенда Labelsourcing

## Содержание

1. [Стек и конфигурация](#1-стек-и-конфигурация)
2. [Модели данных](#2-модели-данных)
3. [Система аутентификации](#3-система-аутентификации)
4. [API методы](#4-api-методы)
   - [Auth — Аутентификация](#auth--аутентификация)
   - [Users — Пользователи](#users--пользователи)
   - [Datasets — Датасеты](#datasets--датасеты)
   - [Tasks — Задачи](#tasks--задачи)
   - [Labels — Разметки](#labels--разметки)
   - [Tags — Теги](#tags--теги)
   - [Sources — Источники данных](#sources--источники-данных)
5. [Сценарии взаимодействия](#5-сценарии-взаимодействия)
6. [Инварианты состояний](#6-инварианты-состояний)

---

## 1. Стек и конфигурация

- **FastAPI** 0.110 + **uvicorn** — веб-сервер
- **SQLAlchemy** 2.0 async + **asyncpg** — ORM и драйвер PostgreSQL
- **Alembic** — миграции БД
- **python-jose** — JWT токены
- **bcrypt** — хеширование паролей
- **httpx** — HTTP-клиент (Яндекс OAuth)

### Переменные окружения (`.env`)

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | Строка подключения к PostgreSQL (async) |
| `SECRET_KEY` | Ключ для подписи JWT |
| `ALGORITHM` | Алгоритм JWT (по умолчанию `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Время жизни токена (по умолчанию `1440` = 24 ч) |
| `YANDEX_CLIENT_ID` | ID приложения Яндекс OAuth |
| `YANDEX_CLIENT_SECRET` | Секрет приложения Яндекс OAuth |
| `YANDEX_REDIRECT_URI` | Callback URL для Яндекс OAuth |

---

## 2. Модели данных

### Перечисления (Enum)

| Enum | Значения |
|---|---|
| `AssignmentStatus` | `in_progress`, `done`, `expired`, `rejected` |
| `TaskStatus` | `pending`, `completed` |
| `TaskType` | `annotation` |
| `DatasetStatus` | `active`, `completed` |

### Таблицы

#### `users`
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID PK | Идентификатор |
| `email` | TEXT UNIQUE | Почта (логин) |
| `password` | TEXT | Хеш пароля (bcrypt) |
| `name` | TEXT | Имя пользователя |
| `avatar_url` | TEXT | Ссылка на аватар |
| `created_at` | TIMESTAMP | Дата регистрации |

Связи: `roles` (M2M через `user_roles`), `tags` (M2M через `user_tags`), `datasets` (как owner), `assignments`, `dataset_accesses`.

#### `roles`
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID PK | Идентификатор |
| `name` | TEXT UNIQUE | Имя роли (например: `admin`, `moderator`) |

#### `datasets`
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID PK | Идентификатор |
| `owner_id` | UUID FK → users | Создатель |
| `title` | TEXT | Название |
| `description` | TEXT | Описание |
| `required_answers` | INT (default 3) | Кворум — сколько ответов нужно на задачу |
| `default_labeling_limit` | INT (default 50) | Лимит задач по умолчанию для нового пользователя |
| `tasks_count` | INT (default 0) | Денормализованный счётчик задач; обновляется при добавлении/удалении задач |
| `status` | VARCHAR | `active` / `completed` |
| `annotation_labels` | JSONB | Список меток для аннотации: `[{id, label, color, hotkey}]` |
| `created_at` | TIMESTAMP | Дата создания |

#### `tasks`
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID PK | Идентификатор |
| `dataset_id` | UUID FK → datasets | Датасет |
| `url` | TEXT | Ссылка на контент (изображение, видео и т.д.) |
| `type` | VARCHAR | Тип задачи (`annotation`) |
| `completed_answers` | INT (default 0) | Принятых ответов (сравнивается с `required_answers`) |
| `active_assignments` | INT (default 0) | Активных назначений (задача "в руках") |
| `status` | VARCHAR | `pending` / `completed` |
| `task_metadata` | JSONB | Доп. данные задачи |
| `created_at` | TIMESTAMP | Дата создания |

#### `assignments`
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID PK | Идентификатор |
| `task_id` | UUID FK → tasks | Задача |
| `user_id` | UUID FK → users | Пользователь |
| `status` | VARCHAR | `in_progress` / `done` / `expired` / `rejected` |
| `assigned_at` | TIMESTAMP | Время выдачи |
| `expires_at` | TIMESTAMP | Дедлайн (через 10 минут после выдачи) |

Ограничение: `UNIQUE (task_id, user_id)` — один пользователь не может иметь два активных назначения на одну задачу.

#### `labels`
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID PK | Идентификатор |
| `assignment_id` | UUID FK → assignments UNIQUE | Привязка к попытке |
| `result` | JSONB | Результат разметки (зависит от типа задачи) |
| `created_at` | TIMESTAMP | Время сохранения |

Формат `result` по типу задачи:
- `annotation` → массив объектов с координатами полигонов
- `classification` → `{"label": "cat"}`
- `validation` → `{"is_correct": true}`

#### `tags`
| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID PK | Идентификатор |
| `name` | TEXT UNIQUE | Название тега |
| `color` | TEXT | Цвет (опционально) |

#### `user_dataset_access`
| Поле | Тип | Описание |
|---|---|---|
| `user_id` | UUID FK → users | Пользователь |
| `dataset_id` | UUID FK → datasets | Датасет |
| `labeling_limit` | INT (default 50) | Персональный лимит задач |
| `labeled_count` | INT (default 0) | Уже выполнено задач |
| `can_label` | BOOL (default true) | Право на разметку |
| `can_validate` | BOOL (default false) | Право на валидацию |

Составной PK `(user_id, dataset_id)` — одна запись на пару пользователь–датасет.

---

## 3. Система аутентификации

### Извлечение токена (`dependencies.py`)

`_extract_token(request)` ищет JWT в двух местах (в порядке приоритета):
1. Cookie `access_token`
2. Заголовок `Authorization: Bearer <token>`

### Проверка пользователя

`get_current_user(request, db)`:
1. Извлекает токен
2. Декодирует JWT, достаёт `sub` (UUID пользователя)
3. Загружает пользователя из БД
4. Возвращает объект `User` или бросает `401`

### Проверка ролей

`require_roles(allowed_roles: list[str])` — фабрика зависимостей. Возвращает dependency, которая:
1. Вызывает `get_current_user`
2. Загружает роли пользователя
3. Проверяет наличие хотя бы одной из `allowed_roles`
4. Бросает `403` если ролей недостаточно

---

## 4. API методы

### Auth — Аутентификация

**Базовый путь:** `/auth`

---

#### `POST /auth/login`

Вход по email и паролю.

**Тело запроса:** `application/x-www-form-urlencoded`
```
username=user@example.com&password=secret
```

**Алгоритм:**
1. Ищет пользователя в БД по `email = username`
2. Проверяет пароль через `bcrypt.verify`
3. При совпадении генерирует JWT с `{"sub": user_id}`
4. Возвращает токен в теле ответа

**Ответ `200`:**
```json
{"access_token": "<jwt>", "token_type": "bearer"}
```

**Ошибки:**
- `401` — пользователь не найден или пароль неверный

**Примечание:** Этот метод возвращает токен в теле, а **не** устанавливает cookie. Cookie устанавливает только Яндекс OAuth callback.

---

#### `POST /auth/logout`

Выход — удаляет cookie `access_token`.

**Ответ `200`:**
```json
{"ok": true}
```

---

#### `GET /auth/yandex/login`

Начало OAuth-флоу с Яндексом. Перенаправляет на страницу авторизации Яндекса.

**Query параметры:**
| Параметр | По умолчанию | Описание |
|---|---|---|
| `success_url` | `/` | URL для редиректа после успешного входа |
| `error_url` | `/login` | URL для редиректа при ошибке |

**Алгоритм:**
1. Кодирует `{success_url, error_url}` в base64-строку `state`
2. Формирует URL авторизации Яндекса с параметрами `response_type=code`, `client_id`, `redirect_uri`, `state`
3. Возвращает `302 Redirect` на `https://oauth.yandex.ru/authorize?...`

---

#### `GET /auth/yandex/callback`

Обработчик callback от Яндекса после авторизации пользователя.

**Query параметры:** `code`, `state` (устанавливаются Яндексом автоматически)

**Алгоритм:**
1. Декодирует `state` → извлекает `success_url` и `error_url`
2. Обменивает `code` на access-токен Яндекса (`POST https://oauth.yandex.ru/token`)
3. Запрашивает данные пользователя (`GET https://login.yandex.ru/info`)
4. Извлекает `email` (поле `default_email` или первый из `emails`)
5. Извлекает имя (`real_name` или `display_name`) и аватар (`default_avatar_id`)
6. Ищет пользователя по email в БД:
   - **Нет пользователя** → создаёт нового с рандомным хешем пароля
   - **Пользователь есть** → обновляет `name` и `avatar_url`
7. Генерирует JWT
8. Устанавливает cookie `access_token` (httponly, secure, samesite=lax, max_age=24ч)
9. Перенаправляет на `success_url`

**При любой ошибке:** редиректит на `error_url` (или `/login` если `state` не распарсился)

---

### Users — Пользователи

**Базовый путь:** `/users`

---

#### `GET /users/me`

Профиль текущего авторизованного пользователя.

**Требует:** авторизации (любой пользователь)

**Ответ `200`:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "Иван Иванов",
  "avatar_url": "https://...",
  "created_at": "2024-01-01T00:00:00",
  "roles": [{"id": "uuid", "name": "admin"}],
  "tags": [{"id": "uuid", "name": "опытный", "color": "#ff0000"}]
}
```

---

#### `GET /users/`

Список всех пользователей.

**Требует:** роль `admin`

**Query параметры:**
| Параметр | По умолчанию | Описание |
|---|---|---|
| `limit` | `100` | Максимум записей |
| `offset` | `0` | Смещение (пагинация) |
| `search` | — | Поиск (не реализован) |

**Ответ `200`:** массив объектов `UserResponse` с ролями и тегами

---

#### `PATCH /users/{user_id}`

Изменить роли и/или теги пользователя.

**Требует:** роль `admin`

**Тело запроса:**
```json
{
  "role_ids": ["uuid1", "uuid2"],
  "tag_ids": ["uuid3"]
}
```
Оба поля опциональны. Если поле передано — список **заменяется целиком** (не дополняется).

**Алгоритм:**
1. Ищет пользователя по `user_id`
2. Если `role_ids` передан — загружает роли из БД и устанавливает `user.roles`
3. Если `tag_ids` передан — загружает теги из БД и устанавливает `user.tags`
4. Сохраняет изменения
5. Перезагружает пользователя с relationships (refresh не загружает связи, поэтому делается новый select)

**Ошибки:**
- `404` — пользователь не найден

---

### Datasets — Датасеты

**Базовый путь:** `/datasets`

---

#### `POST /datasets/`

Создать новый датасет.

**Требует:** роль `admin`

**Тело запроса:**
```json
{
  "title": "Мой датасет",
  "description": "Описание",
  "required_answers": 3,
  "default_labeling_limit": 50,
  "annotation_labels": [
    {"id": "cat", "label": "Кошка", "color": "#ff0000", "hotkey": "1"}
  ]
}
```

**Алгоритм:**
1. Создаёт запись `Dataset` с `owner_id = current_user.id`
2. Сохраняет `annotation_labels` как JSONB
3. Возвращает датасет с вычисленными полями (`tasks_count`, `labeled_count` = 0)

---

#### `GET /datasets/`

Список датасетов с прогрессом текущего пользователя.

**Требует:** авторизации

**Query параметры:**
| Параметр | Описание |
|---|---|
| `limit` / `offset` | Пагинация |
| `search` | Поиск по названию (не реализован) |
| `status` | Фильтр по статусу (не реализован) |
| `owner_id` | Фильтр по владельцу |
| `owner_search` | Поиск по имени владельца (не реализован) |
| `tag_ids` | Фильтр по тегам (не реализован) |

**Алгоритм:**
1. Загружает датасеты с тегами (`tasks_count` берётся из денормализованной колонки)
2. Загружает `UserDatasetAccess` для текущего пользователя по всем датасетам одним запросом
3. Вычисляет `user_done` для каждого датасета через `_compute_user_done`

**Вычисление `user_done`:**
```
effective_limit = min(access.labeling_limit, tasks_count)
user_done = !access.can_label OR labeled_count >= effective_limit
```

**Ответ `200`:** массив `DatasetResponse`:
```json
{
  "id": "uuid",
  "title": "...",
  "tasks_count": 100,
  "user_done": false,
  "user_labeling_limit": 50,
  "user_labeled_count": 10,
  "tags": [...],
  ...
}
```

---

#### `GET /datasets/{dataset_id}`

Детальная информация о датасете с прогрессом текущего пользователя.

**Требует:** авторизации

**Алгоритм:** вызывает `_get_dataset_with_counts(db, dataset_id, user_id)`, которая:
1. Считает `tasks_count` (все задачи) и `labeled_count` (задачи с хотя бы одним ответом)
2. Загружает `UserDatasetAccess` пользователя
3. Вычисляет `user_done`, `user_labeling_limit`, `user_labeled_count`

**Ошибки:**
- `404` — датасет не найден

---

#### `PATCH /datasets/{dataset_id}`

Обновить параметры датасета.

**Требует:** роль `admin`

**Тело запроса:** все поля опциональны:
```json
{
  "title": "Новое название",
  "description": "...",
  "required_answers": 5,
  "default_labeling_limit": 100,
  "status": "completed",
  "annotation_labels": [...],
  "tag_ids": ["uuid1"]
}
```

**Алгоритм:** частичное обновление — обновляются только переданные (не `null`) поля. `tag_ids` заменяет теги целиком.

---

#### `GET /datasets/{dataset_id}/next`

Получить следующие доступные задачи для разметки. Центральный метод рабочего процесса.

**Требует:** авторизации

**Query параметры:**
| Параметр | По умолчанию | Ограничения |
|---|---|---|
| `count` | `1` | от 1 до 10 |

**Алгоритм (подробно):**

1. **Проверка существования датасета** — `404` если не найден

2. **Восстановление сессии** — ищет живые (`in_progress` и `expires_at > now()`) ассайнменты пользователя в датасете:
   - Если есть — сразу возвращает их (повторный запрос не выдаёт новые задачи)

3. **Upsert записи доступа** — создаёт `UserDatasetAccess` с `labeling_limit = dataset.default_labeling_limit` если не существует (через `ON CONFLICT DO NOTHING`)

4. **Проверка квоты и прав:**
   ```
   effective_limit = min(access.labeling_limit, total_tasks)
   if not access.can_label OR labeled_count >= effective_limit → return []
   ```

5. **Выбор задачи** с блокировкой (`FOR UPDATE SKIP LOCKED`). Условия выбора:
   - `task.dataset_id == dataset_id`
   - `task.status == pending`
   - Количество живых ассайнментов на задачу < `required_answers`
   - Пользователь НЕ имеет активного (`done` или живого `in_progress`) ассайнмента

6. **Создание ассайнмента** (expires через 10 минут):
   - Если у пользователя уже есть истёкший ассайнмент на эту задачу — **обновляет** его (чтобы не нарушить UNIQUE constraint)
   - Иначе — создаёт новый, инкрементирует `task.active_assignments`

7. Повторяет шаги 5–6 для каждой из `count` задач (flush между итерациями)

8. При отсутствии задач — `rollback` и `return []`

**Ответ `200`:** массив `TaskResponse` с полем `expires_at`

---

#### `GET /datasets/{dataset_id}/tasks`

Список всех задач датасета.

**Требует:** роль `admin`

**Query параметры:** `limit` (100), `offset` (0)

---

#### `GET /datasets/{dataset_id}/access`

Список записей доступа всех пользователей к датасету.

**Требует:** роль `admin`

**Ответ `200`:** массив `UserDatasetAccessResponse`

---

#### `PUT /datasets/{dataset_id}/access/{user_id}`

Создать или обновить запись доступа пользователя к датасету.

**Требует:** роль `admin`

**Тело запроса:** все поля опциональны:
```json
{
  "labeling_limit": 100,
  "can_label": true,
  "can_validate": false
}
```

**Алгоритм:**
- Если запись не существует — создаёт с дефолтами (`labeling_limit` берётся из `dataset.default_labeling_limit` если не передан)
- Если существует — обновляет только переданные поля

---

#### `DELETE /datasets/{dataset_id}/progress/{user_id}`

**[DEV]** Сброс всего прогресса пользователя по датасету.

**Требует:** роль `admin`

**Алгоритм:**
1. Загружает все ассайнменты пользователя в датасете
2. Для каждого ассайнмента:
   - Если `status == done` → `task.completed_answers -= 1`, при необходимости переводит задачу в `pending`
   - Если `status == in_progress` → `task.active_assignments -= 1`
   - Удаляет ассайнмент (каскадно удаляется label)
3. Удаляет запись `UserDatasetAccess`

---

### Tasks — Задачи

**Базовый путь:** `/tasks`

---

#### `POST /tasks/`

Добавить одну задачу в датасет.

**Требует:** роль `admin`

**Тело запроса:**
```json
{
  "dataset_id": "uuid",
  "url": "https://storage.example.com/image.jpg",
  "type": "annotation",
  "task_metadata": {}
}
```

Инкрементирует `dataset.tasks_count += 1`.

**Ошибки:**
- `404` — датасет не найден

**Ответ `201`:** объект `TaskResponse`

---

#### `POST /tasks/batch`

Массовая загрузка задач в датасет.

**Требует:** роль `admin`

**Тело запроса:**
```json
{
  "dataset_id": "uuid",
  "urls": ["https://...", "https://...", "..."],
  "type": "annotation"
}
```

Инкрементирует `dataset.tasks_count += len(urls)`.

**Ошибки:**
- `404` — датасет не найден

**Ответ `201`:**
```json
{"status": "success", "added": 42}
```

---

#### `DELETE /tasks/{task_id}`

Удалить задачу (каскадно удаляются assignments и labels).

**Требует:** роль `admin`

Декрементирует `dataset.tasks_count -= 1`.

**Ошибки:**
- `404` — задача не найдена

---

#### `PUT /tasks/{task_id}/labels`

Сохранить или обновить разметку для активного ассайнмента.

**Требует:** авторизации (пользователь должен иметь ассайнмент на задачу)

**Тело запроса:**
```json
{
  "data": {
    "annotations": [
      {"label": "cat", "points": [[10, 20], [30, 40], ...]}
    ]
  }
}
```

**Алгоритм:**

1. Ищет ассайнмент со статусом `in_progress` или `done` для `(task_id, current_user_id)`
2. Если ассайнмента нет → `400`
3. **Ленивая проверка истечения:** если `status == in_progress` и `expires_at < now()`:
   - Помечает ассайнмент как `expired`
   - Уменьшает `task.active_assignments`
   - Возвращает `410 Gone`
4. Ищет существующий `Label` для ассайнмента:
   - **Повторный сабмит** (label есть): перезаписывает `label.result`, счётчики не меняются → возвращает `200`
   - **Первый сабмит** (label нет):
     - Создаёт `Label`
     - Если `status == in_progress`: помечает ассайнмент `done`, уменьшает `task.active_assignments`, увеличивает `task.completed_answers`
     - Если `task.completed_answers >= dataset.required_answers` → `task.status = completed`
     - Увеличивает `access.labeled_count`

**Ответ `200`:** объект `LabelResponse`

**Ошибки:**
- `400` — нет активного ассайнмента
- `410` — время истекло

---

### Labels — Разметки

**Базовый путь:** `/labels`

---

#### `PATCH /labels/{label_id}/status`

Изменить статус ассайнмента через его разметку (для ручной валидации).

**Требует:** роль `admin` или `moderator`

**Тело запроса:**
```json
{"status": "rejected"}
```

Допустимые статусы: `in_progress`, `done`, `expired`, `rejected`

**Алгоритм:**
1. Ищет `Label` по `label_id`
2. Загружает связанный `Assignment`
3. Устанавливает `assignment.status = new_status`

**Ответ `200`:**
```json
{"status": "updated"}
```

**Ошибки:**
- `404` — разметка не найдена
- `422` — недопустимый статус

---

### Tags — Теги

**Базовый путь:** `/tags`

---

#### `GET /tags/`

Список всех тегов.

**Требует:** авторизации

**Query параметры:** `limit` (100), `offset` (0), `search` (не реализован)

**Ответ `200`:** массив `TagResponse`

---

#### `POST /tags/`

Создать тег.

**Требует:** роль `admin`

**Тело запроса:**
```json
{"name": "опытный", "color": "#00ff00"}
```

**Ошибки:**
- `400` — тег с таким именем уже существует (IntegrityError)

---

#### `PATCH /tags/{tag_id}`

Обновить тег.

**Требует:** роль `admin`

**Тело запроса:** `{name, color}` — оба поля передаются (name обязателен, color опционален)

**Ошибки:**
- `404` — тег не найден

---

#### `DELETE /tags/{tag_id}`

Удалить тег.

**Требует:** роль `admin`

**Ошибки:**
- `404` — тег не найден

---

### Sources — Источники данных

**Базовый путь:** `/sources`

**`GET /sources/`** — заглушка, возвращает пустой список. Требует роль `admin`. Запланировано для настройки источников данных (S3, MinIO и т.д.).

---

## 5. Сценарии взаимодействия

### Сценарий 1: Первый вход пользователя через Яндекс

```
Фронтенд                    Бэкенд                      Яндекс
   |                            |                           |
   |── GET /auth/yandex/login ──>|                           |
   |   ?success_url=/dashboard  |                           |
   |<── 302 redirect ───────────|                           |
   |                            |                           |
   |────────────────────────────────────────────────────────>|
   |             [пользователь вводит логин/пароль Яндекса]  |
   |<────────────────────────────────────────────────────────|
   | (redirect на /auth/yandex/callback?code=...&state=...)  |
   |                            |                           |
   |── GET /auth/yandex/callback >|                           |
   |                            |── POST /token ────────────>|
   |                            |<── {access_token} ─────────|
   |                            |── GET /info ──────────────>|
   |                            |<── {email, name, avatar} ──|
   |                            |                           |
   |                            | [создаёт User в БД]        |
   |                            | [генерирует JWT]           |
   |<── 302 /dashboard ─────────|                           |
   |   Set-Cookie: access_token=<jwt>                        |
```

**Инварианты состояния:**
- После успешного входа: `User` существует в БД, cookie `access_token` установлена
- При повторном входе: `user.name` и `user.avatar_url` обновляются, запись пользователя сохраняется

---

### Сценарий 2: Рабочий цикл разметки задач

```
Пользователь → GET /datasets/               [получает список датасетов]
Пользователь → GET /datasets/{id}           [открывает конкретный датасет]
Пользователь → GET /datasets/{id}/next?count=5  [получает задачи]
  → [создаётся UserDatasetAccess если нет]
  → [создаются Assignments с expires_at = now+10min]
  → [task.active_assignments += 1 для каждой]
  → возвращает задачи с expires_at

Пользователь → PUT /tasks/{task_id}/labels  [отправляет разметку]
  → [создаётся Label]
  → [assignment.status = done]
  → [task.active_assignments -= 1]
  → [task.completed_answers += 1]
  → [если completed_answers >= required_answers → task.status = completed]
  → [access.labeled_count += 1]

Пользователь → PUT /tasks/{task_id}/labels  [исправляет разметку]
  → [label.result перезаписывается, счётчики не меняются]
```

---

### Сценарий 3: Истечение времени задачи

```
Пользователь → GET /datasets/{id}/next      [получает задачи, expires_at = now+10min]
  ... 10+ минут бездействия ...

Вариант A: пользователь всё ещё смотрит на страницу
Пользователь → PUT /tasks/{task_id}/labels
  → [assignment.expires_at < now()]
  → [assignment.status = expired]
  → [task.active_assignments -= 1]
  → 410 Gone

Пользователь → GET /datasets/{id}/next      [запрашивает снова]
  → [expired ассайнмент найден → обновляется (не создаётся новый)]
  → [получает задачу снова с новым expires_at]

Вариант B: пользователь перезагрузил страницу
Пользователь → GET /datasets/{id}/next
  → [живых ассайнментов нет (истекли), expired не считается "живым"]
  → [выдаёт новые задачи через upsert]
```

---

### Сценарий 4: Завершение квоты пользователя

```
Пользователь → GET /datasets/{id}/next
  [access.labeled_count >= effective_limit]
  → возвращает []

[Пользователь больше не может брать задачи из этого датасета]
[Только Админ через PUT /datasets/{id}/access/{user_id} может увеличить labeling_limit]
```

---

### Сценарий 5: Валидация разметки администратором

```
Модератор → PATCH /labels/{label_id}/status
  body: {"status": "rejected"}
  → [assignment.status = rejected]
  → разметка отклонена, задача остаётся в счётчиках

[Примечание: при rejected задача НЕ автоматически возвращается в пул.
 Счётчики task.completed_answers и access.labeled_count не корректируются.
 Это ручная операция — коррекция через [DEV] reset или дополнительную логику.]
```

---

### Сценарий 6: Загрузка датасета и задач (Администратор)

```
Админ → POST /datasets/                     [создаёт датасет с annotation_labels]
Админ → POST /tasks/batch                   [массово загружает URL задач]
  body: {dataset_id, urls: [...], type: "annotation"}
  → [создаётся N задач со status=pending]
Админ → PATCH /datasets/{id}                [изменяет required_answers, теги и т.д.]
Пользователь → GET /datasets/               [видит новый датасет]
```

---

## 6. Инварианты состояний

### Инвариант задачи (`Task`)

```
status = pending:
  completed_answers < required_answers

status = completed:
  completed_answers >= required_answers

active_assignments = count(assignments WHERE status=in_progress AND expires_at > now())
  [поддерживается вручную: +1 при выдаче, -1 при done/expired]
```

### Инвариант ассайнмента (`Assignment`)

```
UNIQUE (task_id, user_id) — один ассайнмент на пару

in_progress → done        : пользователь отправил разметку (PUT /tasks/{id}/labels)
in_progress → expired     : время истекло (при попытке отправить или при повторной выдаче)
done → rejected           : модератор отклонил (PATCH /labels/{id}/status)
done → in_progress        : модератор вернул на доработку (PATCH /labels/{id}/status)
```

### Инвариант квоты пользователя (`UserDatasetAccess`)

```
labeled_count <= labeling_limit
labeled_count = count(assignments WHERE user_id=X AND dataset_id=Y AND status=done)
  [увеличивается при первом сабмите разметки]
  [НЕ уменьшается автоматически при rejected]

can_label = false → пользователь не может брать задачи
labeled_count >= effective_limit → пользователь не может брать задачи
  где effective_limit = min(labeling_limit, total_tasks_in_dataset)
```

### Инвариант сессии (Восстановление)

```
Если у пользователя есть живые (in_progress + expires_at > now()) ассайнменты в датасете:
  GET /datasets/{id}/next → возвращает эти же задачи (без создания новых)
  Это обеспечивает идемпотентность запроса при перезагрузке страницы
```

### Инвариант уникальности ассайнмента при переиздаче

```
Если ассайнмент истёк (expired) и пользователь запрашивает задачу снова:
  НЕ создаётся новый ассайнмент → ОБНОВЛЯЕТСЯ существующий (status, expires_at, assigned_at)
  Это обходит UNIQUE (task_id, user_id) constraint
```

### Инвариант счётчиков при параллельных запросах

```
При выборе задачи используется SELECT ... FOR UPDATE SKIP LOCKED:
  Две параллельные транзакции не возьмут одну задачу одновременно
  Условие: live_count < required_answers проверяется с блокировкой строки
```
