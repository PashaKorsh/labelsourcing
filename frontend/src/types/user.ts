export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  roles: string[];
  tags: { id: string; name: string; color: string }[];
}

export interface UserListItem {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  roles: string[];
  tags: { id: string; name: string; color: string }[];
  createdAt: string;
}
