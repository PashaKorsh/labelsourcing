# Архитектура фронтенда — Label Sourcing

## Общая структура

```
src/
├── App.tsx                    # Корень приложения, управляет режимом
├── types/                     # TypeScript-интерфейсы
├── services/                  # Бизнес-логика, клиенты, сериализация
├── components/                # Переиспользуемые UI-компоненты
├── pages/                     # Страницы (режимы) приложения
├── tools/                     # Определения инструментов и подсказок
└── hooks/                     # Переиспользуемые React-хуки
```

---

## Режимы приложения

`App.tsx` управляет состоянием `AppMode` (`annotation` | `validation`) и рендерит соответствующую страницу. Переключатель отображается в шапке каждой страницы. В будущем режимы станут отдельными роутами.

---

## Клиенты и сервисы

### `imageClient.ts` — реестр клиентов изображений

**Назначение:** знает, как превратить `ImageLocator` в URL, который браузер может отобразить.

**Интерфейс:**
```ts
interface ImageClient {
  readonly sourceId: string;
  resolve(locator: ImageLocator): Promise<string>;  // → URL (https:// | blob: | data:)
  revoke?(objectUrl: string): void;                  // очистка blob:-URL после использования
}
```

**Паттерн:** реестр (`Map<sourceId, ImageClient>`). Каждый источник данных (S3, MinIO, mock) регистрирует свой клиент через `registerImageClient()`. Страница запрашивает нужный клиент через `getImageClient(sourceId)`.

**Получает:** `ImageLocator { source: string; params: Record<string, string> }`
- `source` — идентификатор клиента (`'mock'`, `'s3'`, `'minio'`, ...)
- `params` — специфичные параметры (например, `{ url }` для mock, `{ bucket, key }` для S3)

**Отдаёт:** `Promise<string>` — URL, пригодный для тега `<img src="...">`.

**Где используется:** `WorkspacePage`, `ValidationPage` — оба получают URL изображения одним и тем же способом.

**Текущая реализация:** `MockImageClient` — возвращает `params.url` напрямую. Для реальных приватных хранилищ нужен клиент, который получает данные с аутентификационными заголовками и возвращает `blob:`-URL.

---

### `taskService.ts` — сервис задач разметки

**Назначение:** хранит очередь задач разметки и аннотации к ним на время сессии.

**Интерфейс:**
```ts
interface TaskService {
  getTasks(): readonly AnnotationTask[];
  getAnnotations(taskId: string): ImageAnnotation[];
  saveAnnotations(taskId: string, annotations: ImageAnnotation[], imageSize?: { w, h }): void;
  exportAllAnnotations(): void;
}
```

**Получает:**
- Список задач (`AnnotationTask[]`) — задаётся при инициализации (в будущем загружается с сервера)
- Аннотации от разметчика через `saveAnnotations()` при навигации или сохранении

**Отдаёт:**
- `getAnnotations()` → `ImageAnnotation[]` в формате Annotorious (для восстановления разметки при возврате к задаче)
- `exportAllAnnotations()` → сериализованный JSON в консоль (через `annotationSerializer`)

**Навигация** намеренно не хранится в сервисе — текущий индекс задачи живёт в `WorkspacePage`. Это позволяет переиспользовать сервис в разных контекстах.

---

### `validationService.ts` — сервис задач валидации

**Назначение:** хранит очередь задач для валидации и вердикты валидатора.

**Интерфейс:**
```ts
interface ValidationService {
  getTasks(): readonly ValidationTask[];
  setVerdict(taskId: string, verdict: ValidationVerdict): void;
  getVerdict(taskId: string): ValidationVerdict | null;
  getResults(): ValidationResult[];
  submit(): Promise<void>;
}
```

**Получает:**
- Список задач (`ValidationTask[]`) — в будущем с сервера (содержат `ImageLocator` + сериализованные аннотации разметчика)
- Вердикты от пользователя через `setVerdict()` (`'approved'` | `'rejected'`)

**Отдаёт:**
- `getResults()` → `ValidationResult[]` — массив `{ taskId, verdict }` для отправки
- `submit()` → `Promise<void>` — отправляет результаты на сервер (сейчас логирует в консоль)

**Формат задачи валидации:**
```ts
interface ValidationTask {
  id: string;
  locator: ImageLocator;         // где взять изображение
  annotations: SerializedShape[]; // аннотации разметчика в JSON-формате
}
```

---

### `annotationSerializer.ts` — сериализатор аннотаций

**Назначение:** конвертирует внутренний формат Annotorious в нейтральный JSON для отправки на сервер.

**Получает:** `ImageAnnotation[]` (Annotorious) + натуральные размеры изображения (пиксели)

**Отдаёт:** `SerializedTaskResult { task_id, output_values: { result: SerializedShape[] } }`

**Формат координат:** нормализованные [0, 1] — не зависят от разрешения изображения.

```ts
type SerializedShape =
  | { shape: 'rectangle'; left, top, width, height: number; tag?: string }
  | { shape: 'polygon'; points: { left, top }[]; tag?: string }
```

---

### `annotationDeserializer.ts` — десериализатор аннотаций

**Назначение:** обратная операция к сериализатору. Нужен на странице валидации, где аннотации приходят с сервера в JSON и должны быть показаны через Annotorious.

**Получает:** `SerializedShape[]` + натуральные размеры изображения

**Отдаёт:** `ImageAnnotation[]` в формате Annotorious (с правильными геометрическими типами и `bounds`)

**Почему требуется размер изображения:** координаты хранятся нормализованными, для Annotorious нужны пиксельные значения.

---

## Типы данных

### `ImageLocator` (`types/task.ts`)
```ts
interface ImageLocator {
  source: string;                    // совпадает с ImageClient.sourceId
  params: Record<string, string>;    // специфично для источника
}
```

### `AnnotationTask` (`types/task.ts`)
```ts
interface AnnotationTask {
  id: string;
  locator: ImageLocator;
  name?: string;
}
```

### `Tag` (`types/annotation.ts`)
```ts
interface Tag {
  id: string;
  label: string;
  color: string;   // CSS-цвет, используется для заливки аннотаций
  hotkey?: string;
}
```
> Теги сейчас определены как константа в `WorkspacePage` и продублированы в `ValidationPage`. В будущем должны загружаться с сервера вместе с задачами.

### `ValidationVerdict` (`types/validationTask.ts`)
```ts
type ValidationVerdict = 'approved' | 'rejected';
```

---

## Компоненты

### `AnnotationCanvas`

Основной рабочий холст для режима разметки.

**Что умеет:**
- Отображает изображение с аннотациями через библиотеку Annotorious
- Zoom колесом мыши к курсору; pan средней кнопкой или левой в режиме курсора
- Контекстное меню по правому клику: удалить аннотацию или сменить тег
- Передаёт изменения аннотаций родителю через `onAnnotationsChange`
- Сообщает натуральный размер изображения через `onImageSizeChange`

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
  onPrev?: () => void;
  onNext?: () => void;
}
```

**Внутренняя структура:**
- `useZoomPan` — zoom/pan логика (отдельный хук)
- `<Annotorious>` + `<ImageAnnotator>` — контекст и SVG-оверлей
- `AnnotatorController` — живёт внутри `<Annotorious>`, управляет экземпляром anno: переключает инструменты, загружает аннотации, обрабатывает горячие клавиши (Z/X undo/redo, Delete, D/F навигация)
- `ContextMenuPortal` — рендерится в `document.body` через portal (чтобы CSS-трансформации канваса не смещали позицию меню)

**Почему `key={task.id}`:** Annotorious не поддерживает полную замену изображения без пересоздания. Смена `key` форсирует unmount/mount, даёт чистый стек undo/redo.

**Почему zoom через размер `<img>`, а не CSS `scale()`:** Annotorious вычисляет координаты через `offsetX/offsetY`, которые не учитывают `scale()` на родителях. Изменение физического размера `<img>` заставляет Annotorious пересчитать координаты правильно.

---

### `ReadOnlyAnnotationCanvas`

Упрощённая версия `AnnotationCanvas` для режима валидации — только просмотр.

**Отличия от `AnnotationCanvas`:**
- `drawingEnabled={false}` передаётся в `<ImageAnnotator>` на уровне пропа
- Нет контекстного меню и инструментов
- Всегда активен pan левой кнопкой (нет режима рисования)
- Перезагружает аннотации при их изменении (нужно, т.к. десериализация происходит после загрузки изображения)

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

### `ToolSelector`

Боковая панель выбора инструмента рисования. Принимает список `DrawingToolDef[]` и `activeTool`, вызывает `onSelect`.

---

### `TagSelector`

Боковая панель выбора тега (класса) для аннотации. Показывает цветной индикатор и подсказку горячей клавиши.

---

### `HintsBar`

Нижняя панель с подсказками горячих клавиш. Показывает общие клавиши + специфичные для текущего инструмента (например, для полигона — `S` для удаления вершины).

---

## Страницы

### `WorkspacePage` — режим разметки

**Данные:**
- Задачи: `taskService.getTasks()`
- Изображение: `getImageClient(source).resolve(locator)`
- Аннотации: `taskService.getAnnotations(taskId)` → восстановление при возврате

**Поток:**
1. Смена задачи → сохранить текущие аннотации → загрузить URL нового изображения
2. `AnnotationCanvas` пересоздаётся (`key={task.id}`) с `initialAnnotations` из сервиса
3. Пользователь рисует → аннотации пишутся в `annotationsRef` (без лишних ре-рендеров)
4. «Сохранить» → `taskService.saveAnnotations()` + `exportAllAnnotations()`

**Горячие клавиши:**
- `Q/W/E` — переключение инструмента
- `1-4` — переключение тега
- `Z/X` — undo/redo (также Ctrl+Z/Ctrl+Shift+Z)
- `D/F` — пред/след задача
- `Delete/Backspace/A` — удалить выделенные аннотации
- `S` — удалить вершину полигона

---

### `ValidationPage` — режим валидации

**Данные:**
- Задачи: `validationService.getTasks()` (включают сериализованные аннотации)
- Изображение: `getImageClient(source).resolve(locator)` — тот же механизм
- Аннотации: десериализуются через `deserializeAnnotations()` после получения размера изображения

**Поток:**
1. Смена задачи → загрузить URL изображения, сбросить размер
2. `ReadOnlyAnnotationCanvas` монтируется с пустыми аннотациями
3. Изображение загрузилось → `onImageSizeChange` → `imageSize` известен → `useMemo` десериализует аннотации → холст отображает их
4. Пользователь нажимает `S`/`A` или кликает кнопку → `validationService.setVerdict()`
5. Когда все задачи оценены → появляется «Отправить» → `validationService.submit()`

**Горячие клавиши:**
- `S` — одобрить (корректно)
- `A` — отклонить (некорректно)
- `D/F` — пред/след задача

---

## Хуки

### `useHotkeys(map: HotkeyMap)`

Регистрирует глобальные горячие клавиши. `map` читается через `ref` — не требует перерегистрации слушателя при изменении колбэков. Игнорирует нажатия в `input`, `textarea` и `contenteditable`.

### `useZoomPan(wrapperRef, leftButtonPanRef)`

Zoom колесом мыши с сохранением точки под курсором; pan средней и/или левой кнопкой. Возвращает `{ zoom, panX, panY, reset }`. Применяется как `transform: translate()` на контейнере и как физический размер `<img>` (не `scale()`).

---

## Расширяемость

**Новый источник изображений** (например, MinIO):
1. Создать класс, реализующий `ImageClient` с нужным `sourceId`
2. Зарегистрировать через `registerImageClient(new MinioImageClient())`
3. Задачи с `locator.source === 'minio'` автоматически используют новый клиент

**Новый тип данных для разметки** (текст, аудио):
- Создать новый компонент-холст по образцу `AnnotationCanvas`
- Определить свои инструменты (`DrawingToolDef[]`) и сериализатор
- Добавить новый режим в `AppMode` и страницу

**Реальный бэкенд:**
- `taskService`: заменить `MockTaskService` на HTTP-клиент, загружающий задачи с API
- `validationService`: `submit()` — заменить `console.log` на `fetch`/`axios` POST-запрос
- `imageClient`: добавить клиент с аутентификацией (presigned URL или проксирование)
