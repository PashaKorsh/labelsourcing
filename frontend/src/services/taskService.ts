import type { ImageAnnotation } from '@annotorious/annotorious';
import type { AnnotationTask } from '../types/task';
import { serializeTaskAnnotations } from './annotationSerializer';

// Управляет очередью задач разметки и хранит аннотации для каждой задачи.
// Навигация (текущий индекс) намеренно оставлена в React-компоненте.
// Для реальных запросов к API используйте annotationApi.ts.
export interface TaskService {
  getTasks(): readonly AnnotationTask[];
  getAnnotations(taskId: string): ImageAnnotation[];
  saveAnnotations(taskId: string, annotations: ImageAnnotation[], imageSize?: { w: number; h: number }): void;
  exportAllAnnotations(): void;
}

class MockTaskService implements TaskService {
  private readonly tasks: AnnotationTask[] = [
    {
      id: 'task-1',
      datasetId: 'mock-dataset',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
    },
    {
      id: 'task-2',
      datasetId: 'mock-dataset',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/3840px-React-icon.svg.png',
    },
    {
      id: 'task-3',
      datasetId: 'mock-dataset',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Docker_%28container_engine%29_logo.svg/1920px-Docker_%28container_engine%29_logo.svg.png',
    },
  ];

  private readonly annotationsMap = new Map<string, ImageAnnotation[]>();
  private readonly imageSizeMap = new Map<string, { w: number; h: number }>();

  getTasks(): readonly AnnotationTask[] {
    return this.tasks;
  }

  getAnnotations(taskId: string): ImageAnnotation[] {
    return this.annotationsMap.get(taskId) ?? [];
  }

  saveAnnotations(taskId: string, annotations: ImageAnnotation[], imageSize?: { w: number; h: number }): void {
    this.annotationsMap.set(taskId, annotations);
    if (imageSize) this.imageSizeMap.set(taskId, imageSize);
  }

  exportAllAnnotations(): void {
    const output = this.tasks
      .filter(task => (this.annotationsMap.get(task.id)?.length ?? 0) > 0)
      .map(task => {
        const annotations = this.annotationsMap.get(task.id)!;
        const size = this.imageSizeMap.get(task.id);
        if (!size) {
          console.warn(`[taskService] Размер изображения для задачи ${task.id} неизвестен, координаты не нормализованы`);
          return serializeTaskAnnotations(task.id, annotations, 1, 1);
        }
        return serializeTaskAnnotations(task.id, annotations, size.w, size.h);
      });

    console.log('[taskService] exportAllAnnotations:', JSON.stringify(output, null, 2));
  }
}

export const taskService: TaskService = new MockTaskService();
