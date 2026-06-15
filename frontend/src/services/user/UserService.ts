import type { UserProfile, UserListItem, Role } from '../../types/user';

export interface UserListParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface UserUpdateInput {
  roleIds?: string[];
  tagIds?: string[];
}

export interface UserService {
  getMe(): Promise<UserProfile>;
  list(params?: UserListParams): Promise<UserListItem[]>;
  listRoles(): Promise<Role[]>;
  update(id: string, data: UserUpdateInput): Promise<UserListItem>;
}
