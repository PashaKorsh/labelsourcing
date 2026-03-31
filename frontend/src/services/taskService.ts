import type { ImageAnnotation } from '@annotorious/annotorious';
import type { AnnotationTask } from '../types/task';

// Управляет очередью задач разметки и хранит аннотации для каждой задачи.
// Навигация (текущий индекс) намеренно оставлена в React-компоненте —
// сервис не знает, какая задача «текущая», чтобы его можно было использовать
// в разных контекстах (список, рабочее пространство, ревью и т.д.).
export interface TaskService {
  getTasks(): readonly AnnotationTask[];
  getAnnotations(taskId: string): ImageAnnotation[];
  saveAnnotations(taskId: string, annotations: ImageAnnotation[]): void;
}

// ─── Mock-реализация ──────────────────────────────────────────────────────────

class MockTaskService implements TaskService {
  private readonly tasks: AnnotationTask[] = [
    {
      id: 'task-1',
      name: 'Sample 1 — PNG transparency demo',
      locator: {
        source: 'mock',
        params: {
          url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
        },
      },
    },
    {
      id: 'task-2',
      name: 'Sample 2 — React logo',
      locator: {
        source: 'mock',
        params: {
          url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/3840px-React-icon.svg.png',
        },
      },
    },
    {
      id: 'task-3',
      name: 'Sample 3 — Docker logo',
      locator: {
        source: 'mock',
        params: {
          url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Docker_%28container_engine%29_logo.svg/1920px-Docker_%28container_engine%29_logo.svg.png',
        },
      },
    },
  ];

  // Хранилище в памяти. Реальная реализация будет вызывать API бэкенда.
  private readonly annotationsMap = new Map<string, ImageAnnotation[]>();

  getTasks(): readonly AnnotationTask[] {
    return this.tasks;
  }

  getAnnotations(taskId: string): ImageAnnotation[] {
    return this.annotationsMap.get(taskId) ?? [];
  }

  saveAnnotations(taskId: string, annotations: ImageAnnotation[]): void {
    this.annotationsMap.set(taskId, annotations);
  }
}

export const taskService: TaskService = new MockTaskService();
