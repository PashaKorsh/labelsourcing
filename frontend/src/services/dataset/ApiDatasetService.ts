import type { Dataset } from '../../types/dataset';
import type { AnnotationTask } from '../../types/task';
import type { DatasetService, DatasetListParams, DatasetCreateInput, DatasetUpdateInput } from './DatasetService';
import { API, apiFetch } from '../../config/api';

interface DatasetDto {
  id: string;
  title?: string | null;
  description: string | null;
  tags: { id: string; name: string; color: string | null }[];
  tasks_count?: number;
  user_status?: string;
  user_tasks_limit?: number | null;
  user_tasks_done?: number | null;
  required_answers?: number | null;
  validation_quorum?: number | null;
  requires_validation?: boolean | null;
  default_tasks_limit?: number | null;
  settings?: Record<string, unknown> | null;
}

interface TaskDto {
  id: string;
  dataset_id: string;
  url: string;
  task_metadata?: Record<string, unknown>;
}

function mapDto(dto: DatasetDto): Dataset {
  return {
    id: dto.id,
    title: dto.title ?? undefined,
    description: dto.description ?? '',
    tags: dto.tags.map(t => ({ id: t.id, name: t.name, color: t.color ?? '#d9d9d9' })),
    taskCount: dto.tasks_count,
    userTasksLimit: dto.user_tasks_limit ?? undefined,
    userTasksDone: dto.user_tasks_done ?? undefined,
    userStatus: (dto.user_status ?? 'NOT_STARTED') as Dataset['userStatus'],
    requiredAnswers: dto.required_answers ?? undefined,
    validationQuorum: dto.validation_quorum ?? undefined,
    requiresValidation: dto.requires_validation ?? undefined,
    defaultTasksLimit: dto.default_tasks_limit ?? undefined,
    settings: dto.settings ?? undefined,
  };
}

export class ApiDatasetService implements DatasetService {
  async list(params?: DatasetListParams): Promise<Dataset[]> {
    const qs = new URLSearchParams();
    if (params?.search)  qs.set('search', params.search);
    if (params?.status)  qs.set('status', params.status);
    if (params?.limit  !== undefined) qs.set('limit',  String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const qsStr = qs.toString();
    const url = qsStr ? `${API.datasets.list()}?${qsStr}` : API.datasets.list();
    const res = await apiFetch(url);
    const dtos: DatasetDto[] = await res.json();
    return dtos.map(mapDto);
  }

  async get(id: string): Promise<Dataset> {
    const res = await apiFetch(API.datasets.detail(id));
    const dto: DatasetDto = await res.json();
    return mapDto(dto);
  }

  async getTasks(datasetId: string): Promise<AnnotationTask[]> {
    const res = await apiFetch(API.datasets.tasks(datasetId));
    const dtos: TaskDto[] = await res.json();
    return dtos.map(dto => ({
      id: dto.id,
      datasetId: dto.dataset_id,
      imageUrl: dto.url,
      metadata: dto.task_metadata,
    }));
  }

  async create(data: DatasetCreateInput): Promise<Dataset> {
    const res = await apiFetch(API.datasets.create(), {
      method: 'POST',
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        tag_ids: data.tagIds,
        required_answers: data.requiredAnswers,
        validation_quorum: data.validationQuorum,
        requires_validation: data.requiresValidation,
        default_tasks_limit: data.defaultTasksLimit,
        settings: data.settings,
      }),
    });
    const dto: DatasetDto = await res.json();
    return mapDto(dto);
  }

  async delete(id: string): Promise<void> {
    await apiFetch(API.datasets.delete(id), { method: 'DELETE' });
  }

  async exportLabels(id: string): Promise<unknown[]> {
    const res = await apiFetch(API.datasets.export(id));
    return res.json();
  }

  async update(id: string, data: DatasetUpdateInput): Promise<Dataset> {
    const body: Record<string, unknown> = {
      title: data.title,
      description: data.description,
      tag_ids: data.tagIds,
      required_answers: data.requiredAnswers,
      validation_quorum: data.validationQuorum,
      requires_validation: data.requiresValidation,
      default_tasks_limit: data.defaultTasksLimit,
    };
    // settings передаём явно: null → {} (сброс), объект → обновление, undefined → не трогаем
    if (data.settings !== undefined) {
      body.settings = data.settings ?? {};
    }
    const res = await apiFetch(API.datasets.update(id), {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    const dto: DatasetDto = await res.json();
    return mapDto(dto);
  }
}
