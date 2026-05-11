import type { Dataset } from '../../types/dataset';
import type { AnnotationTask } from '../../types/task';
import type { DatasetService, DatasetListParams, DatasetCreateInput, DatasetUpdateInput } from './DatasetService';
import { API, apiFetch } from '../../config/api';

interface AnnotationLabelDto {
  id: string;
  label: string;
  color: string;
  hotkey?: string;
}

interface DatasetDto {
  id: string;
  title?: string | null;
  description: string | null;
  tags: { id: string; name: string; color: string | null }[];
  tasks_count?: number;
  user_done?: boolean;
  user_can_validate?: boolean;
  user_labeling_limit?: number | null;
  user_labeled_count?: number | null;
  annotation_labels?: AnnotationLabelDto[] | null;
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
    userLabelingLimit: dto.user_labeling_limit ?? undefined,
    userLabeledCount: dto.user_labeled_count ?? undefined,
    userDone: dto.user_done ?? false,
    userCanValidate: dto.user_can_validate ?? false,
    annotationLabels: dto.annotation_labels?.map(l => ({
      id: l.id,
      label: l.label,
      color: l.color,
      hotkey: l.hotkey,
    })),
  };
}

export class ApiDatasetService implements DatasetService {
  async list(params?: DatasetListParams): Promise<Dataset[]> {
    const qs = new URLSearchParams();
    if (params?.search)  qs.set('search', params.search);
    if (params?.status)  qs.set('status', params.status);
    if (params?.ownerId) qs.set('owner_id', params.ownerId);
    if (params?.limit  !== undefined) qs.set('limit',  String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const qsStr = qs.toString();
    const url = qsStr ? `${API.datasets.list()}?${qsStr}` : API.datasets.list();
    const res = await apiFetch(url);
    const dtos: DatasetDto[] = await res.json();
    return dtos.map(mapDto);
  }

  async listMine(ownerId: string, search?: string): Promise<Dataset[]> {
    return this.list({ ownerId, search });
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
        annotation_labels: data.annotationLabels,
      }),
    });
    const dto: DatasetDto = await res.json();
    return mapDto(dto);
  }

  async update(id: string, data: DatasetUpdateInput): Promise<Dataset> {
    const res = await apiFetch(API.datasets.update(id), {
      method: 'PATCH',
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        tag_ids: data.tagIds,
        annotation_labels: data.annotationLabels,
      }),
    });
    const dto: DatasetDto = await res.json();
    return mapDto(dto);
  }
}
