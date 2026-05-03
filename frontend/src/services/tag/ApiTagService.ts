import type { AppTag } from '../../types/appTag';
import type { TagService, TagListParams, TagCreateInput, TagUpdateInput } from './TagService';
import { API, apiFetch } from '../../config/api';

interface TagDto {
  id: string;
  name: string;
  color: string | null;
}

function mapDto(dto: TagDto): AppTag {
  return { id: dto.id, name: dto.name, color: dto.color };
}

export class ApiTagService implements TagService {
  async list(params?: TagListParams): Promise<AppTag[]> {
    const qs = new URLSearchParams();
    if (params?.search)  qs.set('search', params.search);
    if (params?.limit  !== undefined) qs.set('limit',  String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const qsStr = qs.toString();
    const url = qsStr ? `${API.tags.list()}?${qsStr}` : API.tags.list();
    const res = await apiFetch(url);
    const dtos: TagDto[] = await res.json();
    return dtos.map(mapDto);
  }

  async create(data: TagCreateInput): Promise<AppTag> {
    const res = await apiFetch(API.tags.create(), {
      method: 'POST',
      body: JSON.stringify({ name: data.name, color: data.color }),
    });
    const dto: TagDto = await res.json();
    return mapDto(dto);
  }

  async update(id: string, data: TagUpdateInput): Promise<AppTag> {
    const res = await apiFetch(API.tags.update(id), {
      method: 'PATCH',
      body: JSON.stringify({ name: data.name, color: data.color }),
    });
    const dto: TagDto = await res.json();
    return mapDto(dto);
  }

  async delete(id: string): Promise<void> {
    await apiFetch(API.tags.delete(id), { method: 'DELETE' });
  }
}
