import type { AnnotationTask } from '../types/task';
import type { SerializedShape } from './annotationSerializer';
import { API, apiFetch } from '../config/api';

// DTO бэкенда
interface TaskDto {
  id: string;
  dataset_id: string;
  url: string;
  task_metadata?: Record<string, unknown>;
}

export interface LabelDto {
  id: string;
  task_id: string;
  user_id: string;
  data: { result: SerializedShape[] };
}

function toAnnotationTask(dto: TaskDto): AnnotationTask {
  return {
    id: dto.id,
    datasetId: dto.dataset_id,
    imageUrl: dto.url,
    metadata: dto.task_metadata,
  };
}

// Следующая задача из датасета, которую текущий пользователь ещё не размечал.
// Возвращает null, если все задачи уже размечены.
export async function getNextTask(datasetId: string): Promise<AnnotationTask | null> {
  const res = await apiFetch(API.tasks.next(datasetId));
  const dto: TaskDto | null = await res.json();
  return dto ? toAnnotationTask(dto) : null;
}

// Сохранить результат разметки одной задачи.
export async function submitLabel(taskId: string, shapes: SerializedShape[]): Promise<LabelDto> {
  const res = await apiFetch(API.labels.create(), {
    method: 'POST',
    body: JSON.stringify({ task_id: taskId, data: { result: shapes } }),
  });
  return res.json();
}

// Обновить статус проверки разметки (для модераторов/админов).
// Бэкенд ждёт PATCH /api/labels/{id}/status с телом { status: string }.
export async function updateLabelStatus(
  labelId: string,
  status: 'approved' | 'rejected',
): Promise<void> {
  await apiFetch(API.labels.updateStatus(labelId), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// NOTE: Загрузка разметок по задаче (для страницы валидации) невозможна без
// эндпоинта GET /api/labels/task/{task_id} — его пока нет на бэкенде.
