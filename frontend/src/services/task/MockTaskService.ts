import type { ImageAnnotation } from '@annotorious/annotorious';
import type { AnnotationTask } from '@/types/task';
import type { TaskService } from './TaskService';
import { serializeTaskAnnotations } from '@/utils/annotationSerializer';

export const MOCK_DATASET_ID = 'mock-dataset';

export class MockTaskService implements TaskService {
  private readonly tasks: AnnotationTask[] = [
    {
      id: 'task-1',
      datasetId: MOCK_DATASET_ID,
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
    },
    {
      id: 'task-2',
      datasetId: MOCK_DATASET_ID,
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/3840px-React-icon.svg.png',
    },
    {
      id: 'task-3',
      datasetId: MOCK_DATASET_ID,
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Docker_%28container_engine%29_logo.svg/1920px-Docker_%28container_engine%29_logo.svg.png',
    },
  ];

  private readonly annotationsMap = new Map<string, ImageAnnotation[]>();
  private readonly imageSizeMap = new Map<string, { w: number; h: number }>();

  // Все задачи предзагружены — loadNextTask возвращает null.
  async loadNextTask(_datasetId: string, _count?: number): Promise<AnnotationTask | null> {
    return null;
  }

  getTasks(): readonly AnnotationTask[] {
    return this.tasks;
  }

  getAnnotations(taskId: string): ImageAnnotation[] {
    return this.annotationsMap.get(taskId) ?? [];
  }

  async saveAnnotations(
    taskId: string,
    annotations: ImageAnnotation[],
    imageSize?: { w: number; h: number },
  ): Promise<void> {
    this.annotationsMap.set(taskId, annotations);
    if (imageSize) this.imageSizeMap.set(taskId, imageSize);
  }

  async createBatch(datasetId: string, imageUrls: string[]): Promise<void> {
    imageUrls.forEach((url, i) => {
      this.tasks.push({ id: `mock-${Date.now()}-${i}`, datasetId, imageUrl: url });
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) this.tasks.splice(idx, 1);
  }

  async submitValidation(_taskId: string, isCorrect: boolean): Promise<void> {
    console.log('[MockTaskService] submitValidation:', _taskId, isCorrect);
  }

  clearCache(): void {
    // mock — задачи предзагружены статически, сбрасывать нечего
  }

  removeFromCache(taskId: string): void {
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) this.tasks.splice(idx, 1);
    this.annotationsMap.delete(taskId);
    this.imageSizeMap.delete(taskId);
  }

  exportAllAnnotations(): void {
    const output = this.tasks
      .filter(task => (this.annotationsMap.get(task.id)?.length ?? 0) > 0)
      .map(task => {
        const annotations = this.annotationsMap.get(task.id)!;
        const size = this.imageSizeMap.get(task.id);
        if (!size) {
          console.warn(`[MockTaskService] Размер изображения для задачи ${task.id} неизвестен`);
          return serializeTaskAnnotations(task.id, annotations, 1, 1);
        }
        return serializeTaskAnnotations(task.id, annotations, size.w, size.h);
      });
    console.log('[MockTaskService] exportAllAnnotations:', JSON.stringify(output, null, 2));
  }
}
