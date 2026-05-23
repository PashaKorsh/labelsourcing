import type { AppTag } from './appTag';
import type { Tag } from './annotation';

export type UserDatasetStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'USER_DONE' | 'COMPLETED' | 'WAITING_VALIDATION';

export interface Dataset {
  id: string;
  title?: string;
  description: string;
  tags: AppTag[];
  imageUrl?: string;
  userStatus: UserDatasetStatus;
  taskCount?: number;
  userLabelingLimit?: number;
  userLabeledCount?: number;
  annotationLabels?: Tag[];
  requiredAnswers?: number;
  validationQuorum?: number;
  requiresValidation?: boolean;
  defaultLabelingLimit?: number;
}
