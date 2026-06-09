import type { AppTag } from '@/types/appTag';
import type { TagService, TagListParams, TagCreateInput, TagUpdateInput } from './TagService';

export class MockTagService implements TagService {
  private tags: AppTag[] = [
    { id: 'tag-medic', name: 'Медик', color: '#eb5757' },
    { id: 'tag-user',  name: 'Пользователь', color: '#d9d9d9' },
  ];

  async list(_params?: TagListParams): Promise<AppTag[]> {
    return [...this.tags];
  }

  async create(data: TagCreateInput): Promise<AppTag> {
    const tag: AppTag = {
      id: `tag-${Date.now()}`,
      name: data.name,
      color: data.color ?? null,
    };
    this.tags.push(tag);
    return tag;
  }

  async update(id: string, data: TagUpdateInput): Promise<AppTag> {
    const idx = this.tags.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Tag ${id} not found`);
    const updated: AppTag = { ...this.tags[idx], ...data };
    this.tags[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    const idx = this.tags.findIndex(t => t.id === id);
    if (idx !== -1) this.tags.splice(idx, 1);
  }
}
