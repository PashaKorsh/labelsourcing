# Frontend — LabelSourcing

Веб-приложение платформы разметки: вход, список датасетов, рабочее место разметчика и валидатора
(холст на Annotorious), админ-страницы (пользователи, теги, датасеты) и управление локальными
утилитами.

Стек: React 19 + TypeScript + Vite, роутинг — react-router-dom v7, разметка изображений —
@annotorious/react, стили — CSS Modules + Tailwind v4, иконки — lucide-react.

---

## 1. Структура проекта

```
src/
├── main.tsx / App.tsx        # Входная точка и роутер
├── config/                   # Маршруты, эндпоинты API, роли/права
│   ├── routes.ts             # ROUTES + buildRoute()
│   ├── api.ts                # Карта эндпоинтов + apiFetch (cookie, refresh на 401)
│   └── permissions.ts        # Роли, hasRole(), NAV_ITEMS
├── context/auth.tsx          # AuthProvider / useAuth (профиль в localStorage)
├── services/                 # Бизнес-логика и клиенты API (см. раздел 3)
├── pages/                    # Страницы (см. раздел 5)
├── components/               # Переиспользуемые компоненты (см. раздел 7)
├── hooks/                    # useHotkeys, useZoomPan, useRouteParams, useIsExpired
├── tools/                    # Определения инструментов рисования и подсказки
├── types/                    # TS-интерфейсы доменных моделей
├── utils/                    # Сериализация аннотаций, время
└── theme.ts                  # Светлая/тёмная тема
```

---

## 2. Конфигурация и переменные окружения

Все настройки сборки задаются через переменные Vite (`import.meta.env`). Локально их удобно
класть в `frontend/.env`, в Docker они приходят build-аргументами (см. RUNNING.md).

| Переменная | Значения | Что делает |
|---|---|---|
| `VITE_API_URL` | URL или пусто | База адресов бэкенда. Пусто = тот же origin, что и фронтенд. Используется в `config/api.ts` (`API_BASE`) |
| `VITE_API_MODE` | `real` (дефолт) / `mock` | Какие реализации сервисов подставить. `real` — реальные HTTP-запросы (`Api*`); `mock` — заглушки (`Mock*`), работают без бэкенда. Проверяется в `services/index.ts` как `USE_REAL_API = VITE_API_MODE !== 'mock'` |
| `VITE_DEV_PANEL` | `'true'` / прочее | Включает инструменты разработчика в UI: панель быстрого DEV-входа на странице входа (`AuthPage`) и редактор сырых настроек датасета `RawSettingsEditor` (JSON) на `DatasetEditPage` |

Отдельно есть встроенный флаг Vite `import.meta.env.DEV` (true в dev-сборке) — по нему показывается
переключатель `ModeSwitcher`. Это не наша переменная, а стандартный признак dev-режима Vite.

Скрипты `package.json`: `npm run dev` (dev-сервер Vite с HMR), `npm run build`
(`tsc -b && vite build`), `npm run lint`, `npm run preview`.

Замечание про запуск через npm. Основной способ поднять проект — Docker (см. RUNNING.md). Чистый
запуск фронтенда через `npm run dev` давно не проверялся и может подтормаживать или вести себя
неожиданно (устаревшие зависимости, расхождения окружения). Если нужен именно dev-сервер и что-то
не заводится — это ожидаемо, начинать разбор стоит с переустановки зависимостей
(`rm -rf node_modules && npm install`).

---

## 3. Слой сервисов

Ядро архитектуры фронтенда. Каждый домен описан интерфейсом и имеет две реализации: `Api*`
(реальные HTTP-запросы) и `Mock*` (заглушки для разработки без бэкенда).

```
services/
├── index.ts                  # Выбор реализации по VITE_API_MODE, экспорт синглтонов
├── task/       TaskService, ApiTaskService, MockTaskService
├── validation/ ValidationService, ApiValidationService, MockValidationService
├── dataset/    DatasetService, ApiDatasetService, MockDatasetService
├── user/       UserService, ApiUserService, MockUserService
├── tag/        TagService, ApiTagService, MockTagService
└── utility/    UtilityService, ApiUtilityService, MockUtilityService
```

`services/index.ts` выбирает набор по `USE_REAL_API` и экспортирует готовые синглтоны:
`taskService`, `datasetService`, `userService`, `tagService`, `validationService`,
`utilityService`. Компоненты импортируют их из `@/services` и не знают, mock это или реальный API.

### apiFetch (`config/api.ts`)

Единая обёртка над `fetch`:
- всегда `credentials: 'include'` (cookie-сессия) и `Content-Type: application/json`;
- на `401` делает один общий `POST /auth/refresh` (параллельные 401 ждут его результата), затем
  повторяет исходный запрос;
- если refresh не помог — шлёт событие `window` `auth:unauthorized` (его слушает `AuthProvider`)
  и бросает ошибку;
- при `!res.ok` бросает `Error("<status>: <detail>")`.

`API` — единственное место, где перечислены все URL бэкенда (`/api/v1/...`), сгруппированные по
доменам (`auth`, `users`, `datasets`, `tasks`, `proxy`, `utilities`, `labels`, `tags`, `sources`).

### TaskService — устройство

Клиент задач держит локальный кэш-буфер предзагруженных задач (разметка выдаётся пачками):
- `loadNextTask(datasetId, count)` — `GET /datasets/{id}/next`, дедупликация по `id`. При
  восстановлении сессии сравнивает `expiresAt`: если он изменился, значит назначение новое
  (реджект или истечение), и сохранённая локально разметка сбрасывается.
- `getTasks()`, `getAnnotations(id)` — чтение кэша.
- `saveAnnotations(id, annotations, imageSize)` — сериализует в нормализованные координаты (нужен
  натуральный размер картинки) и шлёт `PUT /tasks/{id}/labels` с телом `{data}`.
- `submitValidation(id, isCorrect)` — тот же эндпоинт с телом `{data: {is_correct}}`.
- `clearCache()` / `removeFromCache(id)` — сброс при смене датасета и переход вперёд (пути назад нет).
- Резолв картинки: `imageUrl = dto.url ?? API.proxy.image(dto.id)` — если бэкенд не дал прямой URL,
  идём через прокси.

---

## 4. Маршрутизация и доступ

`App.tsx` оборачивает всё в `BrowserRouter`, затем `AuthProvider`. Приватные маршруты — через
`<ProtectedRoute roles={...}>`.

| Маршрут (`ROUTES`) | Путь | Доступ | Страница |
|---|---|---|---|
| `login` | `/login` | публичный | `AuthPage` |
| `home` | `/datasets` | авторизованные | `DatasetsListPage` |
| `profile` | `/profile` | авторизованные | `ProfilePage` |
| `datasetAnnotation` | `/dataset/:datasetId` | авторизованные | `WorkspacePage` |
| `myDatasets` | `/datasets/manage` | admin/moderator | `MyDatasetsPage` |
| `datasetNew` | `/dataset/new` | admin/moderator | `DatasetEditPage` |
| `datasetEdit` | `/dataset/:datasetId/edit` | admin/moderator | `DatasetEditPage` |
| `users` | `/users` | admin | `UsersPage` |
| `tags` | `/tags` | admin | `TagsPage` |

- AuthProvider (`context/auth.tsx`) хранит профиль в `localStorage`, при монтировании подтягивает
  `GET /users/me`, слушает `auth:unauthorized` и разлогинивает.
- ProtectedRoute редиректит неавторизованных на `/login`, проверяет роли через `hasRole()`. Пустой
  список ролей означает «любой авторизованный».
- `permissions.ts` — константы `ROLE_ADMIN` / `ROLE_MODERATOR`, `hasRole()`, `NAV_ITEMS` (пункты
  меню с требуемыми ролями).

---

## 5. Страницы

### 5.1. Доступные всем авторизованным

#### AuthPage (`/login`)

Экран входа. Вход выполняется только через Яндекс OAuth (кнопка «Войти через Яндекс» ведёт на
`/auth/yandex/login`). Формы входа по логину и паролю на фронтенде нет. При `VITE_DEV_PANEL=true`
дополнительно показывается панель DEV — кнопки быстрого входа под преднастроенными пользователями
(`admin`, `annotator-1`, `annotator-2`) через `POST /auth/dev-login`.

#### DatasetsListPage (`/datasets`)

Список датасетов карточками (`DatasetCard`) с фильтрами (`DatasetFilter`, `SearchBar`). Кнопка
входа в работу и бейджи зависят от статуса пользователя в датасете `userStatus`: `NOT_STARTED`,
`IN_PROGRESS`, `WAITING_VALIDATION`, `LIMIT_REACHED`, `IDLE`, `COMPLETED`.

#### WorkspacePage (`/dataset/:id`)

Рабочее место разметчика и валидатора. Подробно — в разделе 6.

#### ProfilePage (`/profile`)

Профиль пользователя. Содержит `UtilitiesSection` — управление локальными утилитами: генерация
кода привязки, список утилит с признаком online, отвязка.

### 5.2. Для администраторов и модераторов

#### MyDatasetsPage (`/datasets/manage`)

Датасеты, которыми управляет пользователь: все — для админа, только свои — для модератора.

#### DatasetEditPage (`/dataset/new`, `/dataset/:id/edit`)

Создание и редактирование датасета. Вложенные компоненты:
- `AnnotationLabelEditor` — редактор меток разметки (`settings.annotation_labels`);
- `RawSettingsEditor` — прямое редактирование `settings` в виде JSON (только при `VITE_DEV_PANEL=true`);
- `FolderPicker` — выбор папки на машине модератора для utility-датасета (через `/utility/{id}/dirs`).

#### UsersPage (`/users`, только admin)

Управление пользователями: роли (`RoleMenu`), теги, фильтр (`UserFilter`).

#### TagsPage (`/tags`, только admin)

CRUD тегов.

---

## 6. Рабочее место — WorkspacePage

Один и тот же компонент обслуживает и разметку, и валидацию. Режим выбирается по типу задачи
(`task.type`), пришедшему с сервера: `annotation` показывает `AnnotationView`, `validation` —
`ValidationView`.

Как это работает по шагам:
1. Пользователь заходит на `/dataset/:id`. Хук `useWorkspace` загружает первую пачку задач
   (`TASK_BATCH_SIZE = 3`) через `taskService` и метаданные датасета.
2. `index.tsx` (оркестратор) рисует шапку с прогрессом и по `task.type` первой задачи в буфере
   выбирает представление — разметку или валидацию.
3. В `AnnotationView` пользователь размечает изображение и сохраняет; в `ValidationView` смотрит
   чужую разметку и выносит вердикт (принять/отклонить).
4. После сохранения `goNext` убирает текущую задачу из буфера и показывает следующую. Когда в
   буфере остаётся последняя задача, идёт фоновая догрузка следующей пачки.
5. Когда задачи кончаются или исчерпана квота — показывается `CompletedScreen`.

```
WorkspacePage/
├── index.tsx            # Оркестратор: шапка, навигация, выбор представления по task.type
├── useWorkspace.ts      # Весь стейт и логика загрузки/буферизации задач
└── components/
    ├── AnnotationView   # Режим разметки
    ├── ValidationView   # Режим валидации (принять/отклонить)
    ├── ToolSelector     # Панель инструментов
    ├── TagSelector      # Панель меток
    ├── HintsBar         # Подсказки по горячим клавишам
    ├── ExpiryTimer      # Таймер до истечения ассайнмента
    └── CompletedScreen  # Экран «задачи закончились»
```

Что делает `useWorkspace.ts`:
- Сбрасывает весь стейт при смене `datasetId`. Это важно: react-router переиспользует
  `WorkspacePage` между `/dataset/A` и `/dataset/B` (один шаблон маршрута), и без сброса на новом
  датасете остался бы кэш от старого, что приводило бы к ошибкам повторной отправки.
- Ведёт буфер задач с фоновой догрузкой, когда в нём остаётся последняя задача.
- Достаёт из `dataset.settings`: `annotation_labels` (метки, каждой автоматически назначается
  хоткей `1`…`0`), `allowed_tools`, `annotation_instructions`; квоту (`userTasksLimit` /
  `userTasksDone`).
- Возвращает текущую `task`, номер задачи, флаги `hasMoreTasks` / `isExpired` / `canGoNext`, и
  колбэки `markSaved`, `goNext`. `isExpired` считается по `task.expiresAt` через `useIsExpired`;
  перейти «дальше» можно после сохранения либо когда время задачи истекло.

---

## 7. Холст разметки — AnnotationCanvas

Обёртка над `@annotorious/react`.

```
AnnotationCanvas/
├── index.tsx              # Композиция: <Annotorious><ImageAnnotator><img/></…> + контроллер
├── useCanvasBase.ts       # Натуральный размер картинки, зум/пан, контекстное меню
├── useZoomPan.ts          # Зум колесом (точка под курсором), пан средней/левой кнопкой
├── AnnotatorController.tsx# Мост к Annotorious: инструмент, метка, начальные аннотации, события
└── buildTagStyler.ts      # Стилизация фигур по цвету метки
```

Особенности:
- Зум делается через физический размер `<img>`, а не CSS `scale()` — иначе координаты Annotorious
  съезжают.
- У картинки стоит `crossOrigin="anonymous"` — изображения приходят с CORS-заголовками (их ставят
  прокси и утилита).
- `ReadOnlyAnnotationCanvas` — упрощённый холст только для просмотра (режим валидации).

### Инструменты и горячие клавиши

`tools/imageTools.ts` (`IMAGE_DRAWING_TOOLS`): `cursor` (клавиша Q, режим пана — это не инструмент
Annotorious, обрабатывается отдельно), `rectangle` (W), `polygon` (E). Метки переключаются
клавишами `1`…`0`. Глобальные горячие клавиши — через `hooks/useHotkeys.ts` (игнорирует поля ввода).

### Сериализация аннотаций (`utils/annotationSerializer.ts`)

Библиотека Annotorious внутри работает в пиксельных координатах. Наш сериализатор перед отправкой
на бэкенд нормализует все координаты в диапазон `[0, 1]`, деля их на натуральные ширину и высоту
изображения (`imageW` / `imageH`). Поэтому бэкенду не нужно хранить размеры изображений, а
координаты не зависят от разрешения.

- `RECTANGLE` — `{shape: 'rectangle', left, top, width, height, tag?}`;
- `POLYGON` — `{shape: 'polygon', points: [{left, top}], tag?}`.

Итоговое тело: `{ task_id, output_values: { result: SerializedShape[] } }`. Метка берётся из body
с `purpose: 'classifying'`. Десериализатор нужен, чтобы показать чужую разметку на валидации.

Из-за этой нормализации итоговый экспорт тоже хранит относительные координаты, а не пиксели, как в
стандартном COCO. Причина и последствия описаны в `backend/COCO_EXPORT.md`.

---

## 8. Тема

Светлая и тёмная темы (`theme.ts`, `ThemeToggle`). Компоненты используют CSS-переменные, значения
которых переключаются на корне документа.

---

## 9. Расширяемость

- Новый тип разметки (текст, аудио): добавить `type` в `AnnotationTask`, новое представление в
  `WorkspacePage`, свой холст по образцу `AnnotationCanvas` со своими инструментами и сериализатором.
- Новый источник изображений: логика доставки живёт на бэкенде (proxy/direct/utility); фронтенд
  лишь берёт `imageUrl` из задачи (`dto.url ?? /proxy/{id}`), менять его обычно не нужно.
- Новый доменный сервис: описать интерфейс и реализации `Api*` / `Mock*`, зарегистрировать в
  `services/index.ts`.
