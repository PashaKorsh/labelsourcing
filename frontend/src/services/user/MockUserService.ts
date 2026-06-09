import type { UserProfile, UserListItem } from '@/types/user';
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
  private users: UserListItem[] = [...MOCK_USERS];

  async getMe(): Promise<UserProfile> {
    return MOCK_PROFILE;
  }

  async list(params?: UserListParams): Promise<UserListItem[]> {
    let result = [...this.users];
    if (params?.search) {
      const q = params.search.toLowerCase();
      result = result.filter(u =>
        u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }

  async update(id: string, data: UserUpdateInput): Promise<UserListItem> {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error(`User ${id} not found`);

    const allTags = [
      { id: 'tag-medic', name: 'Медик', color: '#eb5757' },
      { id: 'tag-user', name: 'Пользователь', color: '#d9d9d9' },
    ];
    const tags = data.tagIds
      ? allTags.filter(t => data.tagIds!.includes(t.id))
      : this.users[idx].tags;

    const updated: UserListItem = { ...this.users[idx], tags };
    this.users[idx] = updated;
    return updated;
  }
}
