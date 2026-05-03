import type { AppTag } from './appTag';

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  roles: string[];
  tags: AppTag[];
}

export interface UserListItem {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  roles: string[];
  tags: AppTag[];
  createdAt: string;
}
