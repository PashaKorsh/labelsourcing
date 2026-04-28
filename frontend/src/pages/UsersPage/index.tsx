import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { SearchBar } from '../../components/SearchBar';
import { RoleBadge } from '../../components/RoleBadge';
import type { Role } from '../../types/role';
import styles from './UsersPage.module.css';

const AVATAR_URL = 'https://picsum.photos/seed/labelsourcing-avatar/80/80';

interface MockUser {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
  roles: Role[];
}

const MOCK_USERS: MockUser[] = [
  {
    id: 1,
    name: 'Иван Иванов',
    email: 'ivan@labelsourcing.ru',
    avatarUrl: 'https://picsum.photos/seed/labelsourcing-user-1/80/80',
    roles: [{ name: 'Медик', color: '#eb5757' }],
  },
  {
    id: 2,
    name: 'Мария Петрова',
    email: 'maria@labelsourcing.ru',
    avatarUrl: 'https://picsum.photos/seed/labelsourcing-user-2/80/80',
    roles: [{ name: 'Пользователь', color: '#d9d9d9' }],
  },
  {
    id: 3,
    name: 'Алексей Сидоров',
    email: 'alex@labelsourcing.ru',
    avatarUrl: 'https://picsum.photos/seed/labelsourcing-user-3/80/80',
    roles: [
      { name: 'Медик', color: '#eb5757' },
      { name: 'Пользователь', color: '#d9d9d9' },
    ],
  },
];

export function UsersPage() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader title="Пользователи" avatarUrl={AVATAR_URL} />
        <SearchBar />

        <section className={styles.list}>
          {MOCK_USERS.map((user) => (
            <div key={user.id} className={styles.row}>
              <img src={user.avatarUrl} alt="" className={styles.avatar} />
              <div className={styles.info}>
                <p className={styles.name}>{user.name}</p>
                <p className={styles.email}>{user.email}</p>
              </div>
              <div className={styles.roles}>
                {user.roles.map((role) => (
                  <RoleBadge key={role.name} role={role} />
                ))}
              </div>
              <button type="button" className={styles.editButton}>Изменить</button>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
