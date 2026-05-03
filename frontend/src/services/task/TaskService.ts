import type { ImageAnnotation } from '@annotorious/annotorious';
import type { AnnotationTask } from '../../types/task';

export interface TaskService {
  /**
   * Загружает следующую задачу из датасета.
   * Мок — no-op (задачи предзагружены в getTasks).
   * API — запрос к GET /api/v1/datasets/{id}/next, результат добавляется в getTasks().
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
}
