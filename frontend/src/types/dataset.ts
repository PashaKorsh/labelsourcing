import type { AppTag } from './appTag';

export interface Dataset {
  id: string;
  title?: string;
  description: string;
  tags: AppTag[];
  imageUrl?: string;
  completed?: boolean;
  taskCount?: number;
}
