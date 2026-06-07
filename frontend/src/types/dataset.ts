import type { AppTag } from './appTag';

export type UserDatasetStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING_VALIDATION' | 'LIMIT_REACHED' | 'IDLE' | 'COMPLETED';

export interface Dataset {
  id: string;
  title?: string;
  description?: string;
  tags: AppTag[];
  imageUrl?: string;
  userStatus: UserDatasetStatus;
  taskCount?: number;
  userTasksLimit?: number;
  userTasksDone?: number;
  requiredAnswers?: number;
  validationQuorum?: number;
  requiresValidation?: boolean;
  defaultTasksLimit?: number;
  settings?: Record<string, unknown>;
}
