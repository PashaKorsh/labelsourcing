import { useState, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { SearchBar } from '../../components/SearchBar';
import { RoleBadge } from '../../components/RoleBadge';
import { UserEditModal } from './components/UserEditModal';
import { userService } from '../../services';
import type { UserListItem } from '../../types/user';
import styles from './UsersPage.module.css';

export function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);

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
                  {user.tags.length > 0 && (
                    <div className={styles.tags}>
                      {user.tags.map((tag) => (
                        <RoleBadge key={tag.id} role={tag} />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => setEditingUser(user)}
                >
                  Изменить
                </button>
              </div>
            ))
          )}
        </section>
      </div>

      {editingUser && (
        <UserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={updated => {
            setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
            setEditingUser(null);
          }}
        />
      )}
    </main>
  );
}
