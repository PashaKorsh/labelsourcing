import type { UserProfile, UserListItem } from '../../types/user';
import type { UserService, UserListParams, UserUpdateInput } from './UserService';
import { API, apiFetch } from '../../config/api';

interface UserDto {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  roles: { id: string; name: string }[];
  tags: { id: string; name: string; color: string | null }[];
  created_at?: string;
}

function mapDtoToProfile(dto: UserDto): UserProfile {
  return {
    id: dto.id,
    email: dto.email,
    name: dto.name,
    avatarUrl: dto.avatar_url,
    roles: dto.roles?.map(r => r.name) ?? [],
    tags: dto.tags?.map(t => ({ id: t.id, name: t.name, color: t.color ?? '#d9d9d9' })) ?? [],
  };
}

function mapDtoToListItem(dto: UserDto): UserListItem {
  return {
    id: dto.id,
    email: dto.email,
    name: dto.name,
    avatarUrl: dto.avatar_url,
    roles: dto.roles?.map(r => r.name) ?? [],
    tags: dto.tags?.map(t => ({ id: t.id, name: t.name, color: t.color ?? '#d9d9d9' })) ?? [],
    createdAt: dto.created_at ?? '',
  };
}

export class ApiUserService implements UserService {
  async getMe(): Promise<UserProfile> {
    const res = await apiFetch(API.users.me());
    const dto: UserDto = await res.json();
    return mapDtoToProfile(dto);
  }

  async list(params?: UserListParams): Promise<UserListItem[]> {
    const qs = new URLSearchParams();
    if (params?.search)  qs.set('search', params.search);
    if (params?.limit  !== undefined) qs.set('limit',  String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const qsStr = qs.toString();
    const url = qsStr ? `${API.users.list()}?${qsStr}` : API.users.list();
    const res = await apiFetch(url);
    const dtos: UserDto[] = await res.json();
    return dtos.map(mapDtoToListItem);
  }

  async update(id: string, data: UserUpdateInput): Promise<UserListItem> {
    const res = await apiFetch(API.users.update(id), {
      method: 'PATCH',
      body: JSON.stringify({ role_ids: data.roleIds, tag_ids: data.tagIds }),
    });
    const dto: UserDto = await res.json();
    return mapDtoToListItem(dto);
  }
}
