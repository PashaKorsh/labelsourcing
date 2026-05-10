import type { Dataset } from '../../types/dataset';
import type { AnnotationTask } from '../../types/task';
import type { Tag } from '../../types/annotation';

export interface DatasetListParams {
  search?: string;
  status?: 'new' | 'started' | 'done';
  ownerId?: string;
  limit?: number;
  offset?: number;
}

export interface DatasetCreateInput {
  title?: string;
  description: string;
  tagIds?: string[];
  annotationLabels?: Tag[];
}

export interface DatasetUpdateInput {
  title?: string;
  description?: string;
  tagIds?: string[];
  annotationLabels?: Tag[];
}

export interface DatasetService {
  list(params?: DatasetListParams): Promise<Dataset[]>;
  listMine(ownerId: string, search?: string): Promise<Dataset[]>;
  get(id: string): Promise<Dataset>;
  getTasks(datasetId: string): Promise<AnnotationTask[]>;
  create(data: DatasetCreateInput): Promise<Dataset>;
  update(id: string, data: DatasetUpdateInput): Promise<Dataset>;
}
