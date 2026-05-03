import type { Dataset } from '../../types/dataset';
import type { DatasetService, DatasetListParams, DatasetCreateInput, DatasetUpdateInput } from './DatasetService';
import { API, apiFetch } from '../../config/api';

interface DatasetDto {
  id: string;
  description: string | null;
  created_at: string;
  tags: { id: string; name: string; color: string | null }[];
  task_count?: number;
}

function mapDto(dto: DatasetDto): Dataset {
  return {
    id: dto.id,
    description: dto.description ?? '',
    tags: dto.tags.map(t => ({ id: t.id, name: t.name, color: t.color ?? '#d9d9d9' })),
    taskCount: dto.task_count,
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

  async listMine(): Promise<Dataset[]> {
    const meRes = await apiFetch(API.users.me());
    const me: { id: string } = await meRes.json();
    return this.list({ ownerId: me.id });
  }

  async create(data: DatasetCreateInput): Promise<Dataset> {
    const res = await apiFetch(API.datasets.create(), {
      method: 'POST',
      body: JSON.stringify({ description: data.description, tag_ids: data.tagIds }),
    });
    const dto: DatasetDto = await res.json();
    return mapDto(dto);
  }

  async update(id: string, data: DatasetUpdateInput): Promise<Dataset> {
    const res = await apiFetch(API.datasets.update(id), {
      method: 'PATCH',
      body: JSON.stringify({ description: data.description, tag_ids: data.tagIds }),
    });
    const dto: DatasetDto = await res.json();
    return mapDto(dto);
  }
}
