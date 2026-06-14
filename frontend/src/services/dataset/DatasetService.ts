import type { Dataset, SourceType } from '@/types/dataset';
import type { AnnotationTask } from '@/types/task';

export interface DatasetListParams {
  search?: string;
  status?: string;       // пользовательский статус: NOT_STARTED | IN_PROGRESS | USER_DONE | COMPLETED | WAITING_VALIDATION
  mine?: boolean;        // только датасеты текущего пользователя (для «Мои датасеты» модератора)
  tagIds?: string[];
  limit?: number;
  offset?: number;
}

export interface DatasetCreateInput {
  title?: string;
  description?: string | null;
  tagIds?: string[];
  requiredAnswers?: number;
  validationQuorum?: number;
  requiresValidation?: boolean;
  defaultTasksLimit?: number;
  settings?: Record<string, unknown>;
  sourceType?: SourceType;
  utilityId?: string;
}

export interface DatasetUpdateInput {
  title?: string;
  description?: string | null;
  tagIds?: string[];
  requiredAnswers?: number;
  validationQuorum?: number;
  requiresValidation?: boolean;
  defaultTasksLimit?: number;
  settings?: Record<string, unknown> | null;
  sourceType?: SourceType;
  utilityId?: string;
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
