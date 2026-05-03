import type { Dataset } from '../../types/dataset';

export interface DatasetListParams {
  search?: string;
  status?: 'new' | 'started' | 'done';
  ownerId?: string;
  limit?: number;
  offset?: number;
}

export interface DatasetCreateInput {
  description: string;
  tagIds?: string[];
}

export interface DatasetUpdateInput {
  description?: string;
  tagIds?: string[];
}

export interface DatasetService {
  /** Список датасетов с опциональной фильтрацией. */
  list(params?: DatasetListParams): Promise<Dataset[]>;

  /** Датасеты текущего пользователя (owner). */
  listMine(): Promise<Dataset[]>;

  create(data: DatasetCreateInput): Promise<Dataset>;

  update(id: string, data: DatasetUpdateInput): Promise<Dataset>;
}
