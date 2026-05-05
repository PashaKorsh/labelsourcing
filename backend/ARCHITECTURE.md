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
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```
- **`id`**: Идентификатор датасета.
- **`owner_id`**: Ссылка на создателя. Позволяет ограничивать доступ (например, только владелец видит результаты).
- **`name`**: Название для отображения в интерфейсе.
- **`required_answers`**: Глобальный кворум. Указывает, сколько успешных лейблов нужно собрать, чтобы задача считалась закрытой.
- **`status`**: Статус жизненного цикла всего проекта.
    - **Варианты:** `active` (идет раздача), `paused` (остановлено), `completed` (все задачи размечены).
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