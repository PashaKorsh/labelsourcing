### 1. Таблица `users`
Хранит данные исполнителей, модераторов и заказчиков.
SQL
```
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```
- **`id`**: Уникальный идентификатор. Используется как Primary Key для связей с другими таблицами.
- **`email`**: Логин пользователя. Индекс `UNIQUE` защищает от регистрации нескольких аккаунтов на одну почту.
- **`password`**: Хэш пароля для аутентификации.
- **`created_at`**: Время регистрации. Нужно для аналитики активности и сортировки пользователей.
---
### 2. Таблица `datasets`
Группирует задачи в проекты с общими правилами (например, кворумом).
SQL
```
CREATE TABLE datasets (
    id UUID PRIMARY KEY,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    required_answers INT NOT NULL DEFAULT 3,
    status VARCHAR(50) DEFAULT 'active',
    default_labeling_limit INT DEFAULT 50,
    tasks_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```
- **`id`**: Идентификатор датасета.
- **`owner_id`**: Ссылка на создателя. Позволяет ограничивать доступ (например, только владелец видит результаты).
- **`name`**: Название для отображения в интерфейсе.
- **`required_answers`**: Глобальный кворум. Указывает, сколько успешных лейблов нужно собрать, чтобы задача считалась закрытой.
- **`status`**: Статус жизненного цикла всего проекта.
    - **Варианты:** `active` (идет раздача), `paused` (остановлено), `completed` (все задачи размечены).
- **`default_labeling_limit`**: Базовый лимит задач, который будет назначен пользователю при его первом обращении к этому датасету. Позволяет
    гибко настраивать квоты для разных проектов (в одном проекте давать по 50 задач, в другом по 500)
- **`tasks_count`**: Денормализованный счётчик задач в датасете. Обновляется при добавлении/удалении задач (POST /tasks/, POST /tasks/batch, DELETE /tasks/{id}). Используется вместо COUNT(*) JOIN с таблицей tasks.
- **`created_at`**: Дата создания проекта.
---
### 3. Таблица `tasks`
Единица работы. Содержит ссылку на контент и счетчики прогресса.
SQL
```
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    completed_answers INT NOT NULL DEFAULT 0,
    active_assignments INT NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```
- **`id`**: Идентификатор задачи.
- **`dataset_id`**: Привязка к проекту.
- **`url`**: Ссылка на файл (картинка, видео, аудио). Универсальное имя вместо `image_url`.
- **`type`**: Определяет механику работы и интерфейс для юзера.
    - **Варианты:** `classification` (выбор из списка), `annotation` (рисование объектов), `validation` (проверка чужой работы).
- **`completed_answers`**: Счетчик успешно принятых ответов. Сравнивается с `datasets.required_answers`.
- **`active_assignments`**: Счетчик задач «в руках». Нужен, чтобы не выдавать задачу большему числу людей, чем требуется для кворума.
- **`status`**: Состояние готовности.
    - **Варианты:** `pending` (нужны еще ответы), `completed` (кворум набран).
- **`metadata`**: Контейнер для доп. данных. Например, для типа `validation` тут будет лежать ID разметки, которую надо проверить.
- **`created_at`**: Дата импорта задачи.
---
### 4. Таблица `assignments`
Служебная таблица для контроля процесса выдачи и соблюдения дедлайнов.
SQL
```
CREATE TABLE assignments (
    id UUID PRIMARY KEY,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    CONSTRAINT unique_user_task UNIQUE (task_id, user_id)
);
```
- **`id`**: Идентификатор конкретной попытки выполнения.
- **`task_id` / `user_id`**: Кто и какую задачу взял. `UNIQUE` ограничение запрещает одному юзеру брать одну задачу дважды.
- **`status`**: Жизненный цикл попытки.
    - **Варианты:** `in_progress` (юзер работает), `done` (отправил ответ), `expired` (пропал/не успел), `rejected` (разметка отклонена).
- **`assigned_at`**: Время выдачи.
- **`expires_at`**: Дедлайн. Если время больше текущего, а статус `in_progress`, задача считается занятой.
---
### 5. Таблица `labels`
Здесь хранятся «тяжелые» результаты труда пользователей.
SQL
```
CREATE TABLE labels (
    id UUID PRIMARY KEY,
    assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE UNIQUE,
    result JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```
- **`id`**: Идентификатор разметки.
- **`assignment_id`**: Связь с попыткой. `UNIQUE` гарантирует, что на одну попытку будет только один финальный ответ.
- **`result`**: Главное поле с данными.
    - **Варианты:** для `classification` — `{"label": "cat"}`, для `annotation` — массив координат полигонов, для `validation` — `{"is_correct": true}`.
- **`created_at`**: Время сохранения. Помогает вычислять скорость работы юзера (разница с `assigned_at`).
---
### 6. Таблица `user_dataset_access`
Промежуточная таблица-контроллер. Хранит состояние отношений между конкретным человеком и конкретным набором данных: квоты, счетчики прогресса и права доступа.
SQL
```
CREATE TABLE user_dataset_access (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,

    -- Квоты
    labeling_limit INT DEFAULT 50,
    labeled_count INT DEFAULT 0,

    -- Права
    can_label BOOLEAN DEFAULT TRUE,
    can_validate BOOLEAN DEFAULT FALSE,

    PRIMARY KEY (user_id, dataset_id)
);
```
- **`user_id / dataset_id`**: Составной первичный ключ (Composite Primary Key). Гарантирует, что для связки «один юзер — один проект» существует только одна запись с настройками.

- **`labeling_limit`**: Персональный лимит задач на разметку. При создании записи копируется из datasets.default_labeling_limit, но в дальнейшем может быть увеличен модератором индивидуально (докидывание задач).

- **`labeled_count`**: Счетчик уже выполненных и принятых задач в этом проекте конкретным пользователем.

- **`can_label`**: Флаг доступа. Разрешает пользователю запрашивать задачи типа annotation или classification.

- **`can_validate`**: Флаг доступа к проверке чужой работы (type = 'validation'). По умолчанию выключен, может быть включен администратором для проверенных исполнителей.