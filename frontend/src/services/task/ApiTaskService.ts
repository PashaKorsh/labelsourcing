import type { ImageAnnotation } from '@annotorious/annotorious';
import type { AnnotationTask } from '../../types/task';
import type { TaskService } from './TaskService';
import { serializeTaskAnnotations } from '../../utils/annotationSerializer';
import { API, apiFetch } from '../../config/api';

interface TaskDto {
  id: string;
  dataset_id: string;
  url: string;
  full_url?: string | null;
  type?: string;
  task_metadata?: Record<string, unknown>;
  expires_at?: string;
}

export class ApiTaskService implements TaskService {
  private readonly tasks: AnnotationTask[] = [];
  private readonly annotationsMap = new Map<string, ImageAnnotation[]>();
  private readonly imageSizeMap = new Map<string, { w: number; h: number }>();

  // Запрашивает одну задачу у бэкенда и добавляет в кэш, если её там нет.
  // При восстановлении сессии бэк вернёт уже взятый in_progress ассайнмент —
  // дедупликация предотвращает дубликаты в массиве.
  // Возвращает задачу или null, если их больше нет.
  async loadNextTask(datasetId: string): Promise<AnnotationTask | null> {
    const res = await apiFetch(API.datasets.next(datasetId));
    const dto: TaskDto | null = await res.json();
    if (!dto) return null;

    const mapped: AnnotationTask = {
      id: dto.id,
      datasetId: dto.dataset_id,
      imageUrl: dto.full_url ?? dto.url,
      type: dto.type as AnnotationTask['type'],
      metadata: dto.task_metadata,
      expiresAt: dto.expires_at,
    };

    const existingIdx = this.tasks.findIndex(t => t.id === dto.id);
    if (existingIdx !== -1) {
      const existingTask = this.tasks[existingIdx];
      // Если expiresAt изменился — это новое назначение (реджект/истечение), а не восстановление сессии.
      // Сбрасываем сохранённую разметку, чтобы пользователь начал с чистого листа.
      if (existingTask.expiresAt !== dto.expires_at) {
        this.annotationsMap.delete(dto.id);
      }
      this.tasks[existingIdx] = { ...existingTask, expiresAt: dto.expires_at };
      return this.tasks[existingIdx];
    }

    this.tasks.push(mapped);
    return mapped;
  }

  getTasks(): readonly AnnotationTask[] {
    return [...this.tasks];
  }

  getAnnotations(taskId: string): ImageAnnotation[] {
    return this.annotationsMap.get(taskId) ?? [];
  }

  // Сохраняет аннотации локально и отправляет разметку на сервер.
  // dataset_id берётся из кэшированной задачи — он нужен бэкенду, т.к. одна задача
  // может использоваться в нескольких датасетах с разной разметкой.
  async saveAnnotations(
    taskId: string,
    annotations: ImageAnnotation[],
    imageSize?: { w: number; h: number },
  ): Promise<void> {
    this.annotationsMap.set(taskId, annotations);
    if (imageSize) this.imageSizeMap.set(taskId, imageSize);

    const task = this.tasks.find(t => t.id === taskId);
    if (!task) {
      console.error(`[ApiTaskService] Задача ${taskId} не найдена в кэше`);
      return;
    }

    const size = imageSize ?? this.imageSizeMap.get(taskId);
    const serialized = serializeTaskAnnotations(
      taskId,
      annotations,
      size?.w ?? 1,
      size?.h ?? 1,
    );

    await apiFetch(API.tasks.saveLabel(taskId), {
      method: 'PUT',
      body: JSON.stringify({ data: serialized.output_values }),
    });
  }

  async createBatch(datasetId: string, imageUrls: string[]): Promise<void> {
    await apiFetch(API.tasks.batch(), {
      method: 'POST',
      body: JSON.stringify({ dataset_id: datasetId, urls: imageUrls }),
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    await apiFetch(API.tasks.delete(taskId), { method: 'DELETE' });
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) this.tasks.splice(idx, 1);
  }

  clearCache(): void {
    this.tasks.splice(0);
    this.annotationsMap.clear();
    this.imageSizeMap.clear();
  }

  removeFromCache(taskId: string): void {
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) this.tasks.splice(idx, 1);
    this.annotationsMap.delete(taskId);
    this.imageSizeMap.delete(taskId);
  }

  async submitValidation(taskId: string, isCorrect: boolean): Promise<void> {
    await apiFetch(API.tasks.saveLabel(taskId), {
      method: 'PUT',
      body: JSON.stringify({ data: { is_correct: isCorrect } }),
    });
  }

  exportAllAnnotations(): void {
    const output = this.tasks
      .filter(task => (this.annotationsMap.get(task.id)?.length ?? 0) > 0)
      .map(task => {
        const annotations = this.annotationsMap.get(task.id)!;
        const size = this.imageSizeMap.get(task.id);
        if (!size) {
          console.warn(`[ApiTaskService] Размер изображения для задачи ${task.id} неизвестен`);
          return serializeTaskAnnotations(task.id, annotations, 1, 1);
        }
        return serializeTaskAnnotations(task.id, annotations, size.w, size.h);
      });
    console.log('[ApiTaskService] exportAllAnnotations:', JSON.stringify(output, null, 2));
  }
}
