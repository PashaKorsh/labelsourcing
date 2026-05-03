import type { ImageAnnotation } from '@annotorious/annotorious';
import type { AnnotationTask } from '../../types/task';
import type { TaskService } from './TaskService';
import { serializeTaskAnnotations } from '../../utils/annotationSerializer';
import { API, apiFetch } from '../../config/api';

interface TaskDto {
  id: string;
  dataset_id: string;
  url: string;
  task_metadata?: Record<string, unknown>;
}

export class ApiTaskService implements TaskService {
  private readonly tasks: AnnotationTask[] = [];
  private readonly annotationsMap = new Map<string, ImageAnnotation[]>();
  private readonly imageSizeMap = new Map<string, { w: number; h: number }>();

  // Запрашивает следующую задачу, которую текущий пользователь ещё не размечал.
  // Добавляет её в локальный кэш — getTasks() начинает её возвращать.
  async loadNextTask(datasetId: string): Promise<AnnotationTask | null> {
    const res = await apiFetch(API.datasets.next(datasetId));
    const dto: TaskDto | null = await res.json();
    if (!dto) return null;

    const task: AnnotationTask = {
      id: dto.id,
      datasetId: dto.dataset_id,
      imageUrl: dto.url,
      metadata: dto.task_metadata,
    };
    this.tasks.push(task);
    return task;
  }

  getTasks(): readonly AnnotationTask[] {
    return this.tasks;
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
      body: JSON.stringify({ dataset_id: task.datasetId, data: serialized.output_values }),
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
