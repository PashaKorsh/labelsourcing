import type { AppTag } from './appTag';
import type { Tag } from './annotation';

export interface Dataset {
  id: string;
  title?: string;
  description: string;
  tags: AppTag[];
  imageUrl?: string;
  completed?: boolean;
  taskCount?: number;
  annotationLabels?: Tag[];
}
