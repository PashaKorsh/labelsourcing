import { useState, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { SearchBar } from '../../components/SearchBar';
import { RoleBadge } from '../../components/RoleBadge';
import { userService } from '../../services';
import type { UserListItem } from '../../types/user';
import styles from './UsersPage.module.css';

export function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      userService.list({ search: search || undefined })
        .then(setUsers)
        .catch(err => console.error('[UsersPage]', err))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />
        <SearchBar value={search} onChange={setSearch} />

        <section className={styles.list}>
          {loading ? (
            <p>Загрузка…</p>
          ) : (
            users.map((user) => (
              <div key={user.id} className={styles.row}>
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className={styles.avatar} />
                )}
                <div className={styles.info}>
                  <p className={styles.name}>{user.name ?? user.email}</p>
                  <p className={styles.email}>{user.email}</p>
                </div>
                <div className={styles.roles}>
                  {user.tags.map((tag) => (
                    <RoleBadge key={tag.id} role={tag} />
                  ))}
                </div>
                <button type="button" className={styles.editButton}>Изменить</button>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
