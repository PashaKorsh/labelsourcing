import type { ImageAnnotation } from '@annotorious/annotorious';
import type { AnnotationTask } from '../../types/task';

export interface TaskService {
  /**
   * Запрашивает одну задачу из датасета и добавляет её в getTasks().
   * Возвращает задачу или null, если их больше нет.
   * Мок — no-op (задачи предзагружены).
   * API — GET /api/v1/datasets/{id}/next
   */
  loadNextTask(datasetId: string): Promise<AnnotationTask | null>;

  /** Возвращает кэшированный список задач. */
  getTasks(): readonly AnnotationTask[];

  getAnnotations(taskId: string): ImageAnnotation[];

  /**
   * Сохраняет аннотации локально и отправляет на сервер (для API-реализации).
   * @param imageSize — натуральные размеры изображения для нормализации координат.
   */
  saveAnnotations(
    taskId: string,
    annotations: ImageAnnotation[],
    imageSize?: { w: number; h: number },
  ): Promise<void>;

  exportAllAnnotations(): void;

  /** Создаёт задачи для датасета из списка URL изображений. */
  createBatch(datasetId: string, imageUrls: string[]): Promise<void>;

  /** Удаляет задачу по ID. */
  deleteTask(taskId: string): Promise<void>;

  /**
   * Отправляет вердикт валидации.
   * Использует тот же эндпоинт PUT /tasks/{id}/labels с данными {is_correct: boolean}.
   */
  submitValidation(taskId: string, isCorrect: boolean): Promise<void>;

  /** Очищает локальный кэш задач и аннотаций (используется при перезаходе на страницу). */
  clearCache(): void;

  /** Удаляет одну задачу из кэша (вызывается после перехода вперёд — пути назад нет). */
  removeFromCache(taskId: string): void;
}
