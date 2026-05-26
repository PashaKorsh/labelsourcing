import type { Dataset } from '../../types/dataset';
import type { AnnotationTask } from '../../types/task';
import type { Tag } from '../../types/annotation';

export interface DatasetListParams {
  search?: string;
  status?: 'new' | 'started' | 'done';
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
  requiredAnswers?: number;
  validationQuorum?: number;
  requiresValidation?: boolean;
  defaultTasksLimit?: number;
  settings?: Record<string, unknown> | null;
}

export interface DatasetService {
  list(params?: DatasetListParams): Promise<Dataset[]>;
  get(id: string): Promise<Dataset>;
  getTasks(datasetId: string): Promise<AnnotationTask[]>;
  create(data: DatasetCreateInput): Promise<Dataset>;
  update(id: string, data: DatasetUpdateInput): Promise<Dataset>;
  delete(id: string): Promise<void>;
  exportLabels(id: string): Promise<unknown[]>;
}
