export interface Dataset {
  id: string;
  title?: string;
  description: string;
  tags: { id: string; name: string; color: string }[];
  imageUrl?: string;
  completed?: boolean;
  taskCount?: number;
}
