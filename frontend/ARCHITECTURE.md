# Архитектура фронтенда — Label Sourcing

## Общая структура

```
src/
├── App.tsx                    # Роутер приложения (react-router-dom v6)
├── types/                     # TypeScript-интерфейсы
├── services/                  # Бизнес-логика, API-клиенты
├── components/                # Переиспользуемые UI-компоненты
├── pages/                     # Страницы приложения
├── tools/                     # Определения инструментов рисования
├── hooks/                     # Переиспользуемые React-хуки
└── config/                    # Маршруты, базовый URL API
```

---

## Роутинг

`App.tsx` использует `react-router-dom` v6. Ключевые маршруты:

| Путь | Компонент | Описание |
|---|---|---|
| `/` | `DatasetsListPage` | Список датасетов |
| `/dataset/:datasetId` | `WorkspacePage` | Разметка |
| `/dataset/:datasetId/validation` | `WorkspacePage` | Валидация (тот же компонент, другой URL) |
| `/admin` | `AdminPage` | Управление пользователями/датасетами |
| `/login` | `LoginPage` | Страница входа |

`WorkspacePage` самостоятельно определяет режим работы по типу задачи, полученной с сервера, и синхронизирует URL через `navigate`.

---

## Клиенты и сервисы

### `imageClient.ts` — реестр клиентов изображений

**Назначение:** знает, как превратить `ImageLocator` в URL, который браузер может отобразить.

**Интерфейс:**
```ts
interface ImageClient {
  readonly sourceId: string;
  resolve(locator: ImageLocator): Promise<string>;
  revoke?(objectUrl: string): void;
}
```

**Паттерн:** реестр (`Map<sourceId, ImageClient>`). Каждый источник данных регистрирует свой клиент через `registerImageClient()`. Текущая реализация — `MockImageClient` возвращает `params.url` напрямую.

---

### `DatasetService` — сервис датасетов

**Реализации:** `ApiDatasetService` (HTTP), `MockDatasetService` (заглушка).

**Методы:**
- `list(params?)` — список датасетов с параметрами фильтрации
- `listMine(ownerId, search?)` — датасеты конкретного владельца
- `get(id)` — детальная информация + `userCanValidate`

**DTO-маппинг:** `DatasetDto → Dataset`. Поля `user_can_validate`, `user_done`, `user_labeling_limit` маппируются из ответа бэкенда.

---

### `TaskService` — сервис задач

**Реализации:** `ApiTaskService` (HTTP), `MockTaskService` (заглушка).

**Методы:**
- `loadNextTask(datasetId, count, mode?)` — загрузить следующие задачи; `mode` = `'annotation'` | `'validation'` | `undefined` (авто)
- `saveAnnotations(taskId, annotations, imageSize)` — отправить аннотацию
- `submitValidation(taskId, isCorrect)` — отправить вердикт валидации

**Тип задачи:** поле `task.type` (`'annotation'` | `'validation'`) определяет, какой режим показывать.

---

### `annotationSerializer.ts` / `annotationDeserializer.ts`

Конвертируют внутренний формат Annotorious в нормализованный JSON (координаты [0, 1]) и обратно. Десериализатор нужен на валидации для отображения чужих аннотаций. Требует натуральный размер изображения для пересчёта координат.

---

## Типы данных

### `AnnotationTask` (`types/task.ts`)
```ts
interface AnnotationTask {
  id: string;
  datasetId: string;
  imageUrl: string;
  metadata?: Record<string, unknown>;
  type?: 'annotation' | 'validation';  // undefined = annotation
}
```

### `Dataset` (`types/dataset.ts`)
```ts
interface Dataset {
  id: string;
  title?: string;
  description: string;
  tags: AppTag[];
  userDone?: boolean;
  userCanValidate?: boolean;        // кнопка "Валидация" активна
  taskCount?: number;
  userLabelingLimit?: number;
  userLabeledCount?: number;
  annotationLabels?: Tag[];
}
```

### `Tag` (`types/annotation.ts`)
```ts
interface Tag {
  id: string;
  label: string;
  color: string;
  hotkey?: string;
}
```

---

## Компоненты

### `AnnotationCanvas`

Основной рабочий холст для режима разметки.

**Props:**
```ts
{
  imageUrl: string;
  activeTool: string;              // 'cursor' | 'rectangle' | 'polygon'
  activeTag: Tag | null;
  tags: Tag[];
  initialAnnotations: ImageAnnotation[];
  onAnnotationsChange: (annotations: ImageAnnotation[]) => void;
  onImageSizeChange?: (size: { w, h }) => void;
}
```

**Особенности:**
- `key={task.id}` — Annotorious не поддерживает замену изображения без пересоздания
- Zoom через физический размер `<img>`, не через `scale()` — иначе координаты Annotorious съезжают
- Контекстное меню через portal в `document.body`
- `useZoomPan` — zoom/pan логика

---

### `ReadOnlyAnnotationCanvas`

Упрощённая версия для режима валидации — только просмотр, без инструментов.

**Props:**
```ts
{
  imageUrl: string;
  annotations: ImageAnnotation[];
  tags: Tag[];
  onImageSizeChange?: (size: { w, h }) => void;
}
```

---

### `ToolSelector`, `TagSelector`, `HintsBar`

Боковые панели и панель подсказок для режима разметки.

---

## Страницы

### `WorkspacePage` — объединённый рабочий компонент

Один компонент обслуживает оба URL (`/dataset/:id` и `/dataset/:id/validation`). Режим определяется по `task.type`, полученному с сервера.

**Структура файлов:**
```
WorkspacePage/
├── index.tsx          # Оркестратор: шапка, навигация, переключение представлений
├── useWorkspace.ts    # Весь стейт и бизнес-логика
├── AnnotationView.tsx # Компонент режима разметки
├── ValidationView.tsx # Компонент режима валидации
├── WorkspacePage.module.css
├── AnnotationView.module.css
└── ValidationView.module.css
```

#### `useWorkspace.ts`

Содержит весь стейт страницы:
- Определяет `mode` (`'annotation'` | `'validation'`) из текущего URL (`location.pathname`)
- Загрузка задач через `loadNextTask(datasetId, count, mode)` — передаёт mode, чтобы бэкенд выдавал только нужный тип
- Загрузка меток датасета при инициализации
- Список предзагруженных задач, текущий индекс, маркеры сохранённых задач
- Квота (`labelingLimit`, `isExpired`)
- Коллбэки: `markSaved(taskId)`, `navigateTo(index)`

#### `AnnotationView.tsx`

Принимает `{ task, hasMoreTasks, tags, isExpired, onSaved, onPrev?, onNext? }`.

- Внутри: `activeTool`, `activeTagId`, `annotationsRef`, `imageSizeRef`
- Горячие клавиши: `Q/W/E` (инструмент), `1-4` (тег)
- При сохранении вызывает `taskService.saveAnnotations`, затем `onSaved()`

#### `ValidationView.tsx`

Принимает `{ task, tags, onSaved }`.

- Загружает изображение через `new window.Image()` для получения натурального размера
- Десериализует аннотации из `task.metadata.annotations`
- Горячие клавиши: `S` (принять) / `A` (отклонить)
- Отправляет вердикт через `taskService.submitValidation`, затем `onSaved()`

---

### `DatasetsListPage`

Список датасетов. Каждый датасет отображается как `DatasetCard`.

#### `DatasetCard`

Показывает название, описание, теги, прогресс. Содержит:
- **Кнопка "Валидация"**: всегда видна, активна только если `dataset.userCanValidate = true`. При клике переходит на `/dataset/:id/validation`.
- **Кнопка "Играть"** / **Бейдж "Выполнено"**: зависит от `dataset.userDone`.

---

### `AdminPage`

Управление пользователями (роли, теги) и датасетами (создание, задачи, доступ).

---

## Хуки

### `useHotkeys(map: HotkeyMap)`

Глобальные горячие клавиши. `map` читается через `ref` — без перерегистрации слушателя. Игнорирует `input`, `textarea`, `contenteditable`.

### `useZoomPan(wrapperRef, leftButtonPanRef)`

Zoom колесом мыши с сохранением точки под курсором; pan средней и/или левой кнопкой. Возвращает `{ zoom, panX, panY, reset }`.

---

## Расширяемость

**Новый источник изображений** (например, MinIO):
1. Создать класс, реализующий `ImageClient` с нужным `sourceId`
2. Зарегистрировать через `registerImageClient(new MinioImageClient())`
3. Задачи с `locator.source === 'minio'` автоматически используют новый клиент

**Новый тип данных для разметки** (текст, аудио):
- Создать новый компонент-холст по образцу `AnnotationCanvas`
- Определить свои инструменты (`DrawingToolDef[]`) и сериализатор
- Добавить новый `type` в `AnnotationTask` и новое представление в `WorkspacePage`

**Новый режим валидации:**
- Добавить новый `XxxView.tsx` по образцу `ValidationView`
- Переключение по `task.type` в `WorkspacePage/index.tsx`
