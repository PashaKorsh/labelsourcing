import type { AppTag } from '@/types/appTag';

export interface TagListParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TagCreateInput {
  name: string;
  color?: string | null;
}

export interface TagUpdateInput {
  name?: string;
  color?: string | null;
}

export interface TagService {
  list(params?: TagListParams): Promise<AppTag[]>;
  create(data: TagCreateInput): Promise<AppTag>;
  update(id: string, data: TagUpdateInput): Promise<AppTag>;
  delete(id: string): Promise<void>;
}
