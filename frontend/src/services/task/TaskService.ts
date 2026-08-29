import type { ImageAnnotation } from '@annotorious/annotorious';
import type { AnnotationTask } from '@/types/task';

export interface TaskService {
  loadNextTask(datasetId: string, count?: number): Promise<AnnotationTask | null>;

  getTasks(): readonly AnnotationTask[];

  getAnnotations(taskId: string): ImageAnnotation[];

  // imageSize — натуральные размеры изображения для нормализации координат
  saveAnnotations(
    taskId: string,
    annotations: ImageAnnotation[],
    imageSize?: { w: number; h: number },
  ): Promise<void>;

  exportAllAnnotations(): void;

  createBatch(datasetId: string, imageUrls: string[]): Promise<void>;

  deleteTask(taskId: string): Promise<void>;

  // Тот же эндпоинт, что и разметка: PUT /tasks/{id}/labels с {is_correct}
  submitValidation(taskId: string, isCorrect: boolean): Promise<void>;

  clearCache(): void;

  removeFromCache(taskId: string): void;
}
