import type { UserProfile, UserListItem } from '../../types/user';
import type { UserService, UserListParams, UserUpdateInput } from './UserService';

const MOCK_PROFILE: UserProfile = {
  id: 'me',
  email: 'ivan.ivanov@labelsourcing.ru',
  name: 'Иван Иванов',
  avatarUrl: 'https://picsum.photos/seed/labelsourcing-avatar/80/80',
  roles: ['annotator'],
  tags: [{ id: 'tag-medic', name: 'Медик', color: '#eb5757' }],
};

const MOCK_USERS: UserListItem[] = [
  {
    id: '1',
    email: 'ivan@labelsourcing.ru',
    name: 'Иван Иванов',
    avatarUrl: 'https://picsum.photos/seed/labelsourcing-user-1/80/80',
    roles: [],
    tags: [{ id: 'tag-medic', name: 'Медик', color: '#eb5757' }],
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    email: 'maria@labelsourcing.ru',
    name: 'Мария Петрова',
    avatarUrl: 'https://picsum.photos/seed/labelsourcing-user-2/80/80',
    roles: [],
    tags: [{ id: 'tag-user', name: 'Пользователь', color: '#d9d9d9' }],
    createdAt: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    email: 'alex@labelsourcing.ru',
    name: 'Алексей Сидоров',
    avatarUrl: 'https://picsum.photos/seed/labelsourcing-user-3/80/80',
    roles: [],
    tags: [
      { id: 'tag-medic', name: 'Медик', color: '#eb5757' },
      { id: 'tag-user', name: 'Пользователь', color: '#d9d9d9' },
    ],
    createdAt: '2024-01-03T00:00:00Z',
  },
];

export class MockUserService implements UserService {
  async getMe(): Promise<UserProfile> {
    return MOCK_PROFILE;
  }

  async list(_params?: UserListParams): Promise<UserListItem[]> {
    return [...MOCK_USERS];
  }

  async update(id: string, _data: UserUpdateInput): Promise<UserListItem> {
    const user = MOCK_USERS.find(u => u.id === id);
    if (!user) throw new Error(`User ${id} not found`);
    return user;
  }
}
