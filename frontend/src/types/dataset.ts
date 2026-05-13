import type { AppTag } from './appTag';
import type { Tag } from './annotation';

export type DatasetSourceType = 'external_url' | 'local_agent';

/** Расширяемые параметры источника (например, Яндекс.Диск в будущем). */
export type DatasetSourceConfig = Record<string, unknown>;

export interface Dataset {
  id: string;
  title?: string;
  description: string;
  tags: AppTag[];
  imageUrl?: string;
  completed?: boolean;
  userDone?: boolean;
  taskCount?: number;
  userLabelingLimit?: number;
  userLabeledCount?: number;
  annotationLabels?: Tag[];
  sourceType?: DatasetSourceType;
  localAgentId?: string;
  sourceConfig?: DatasetSourceConfig | null;
}
