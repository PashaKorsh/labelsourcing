import { useState, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { SearchBar } from '../../components/SearchBar';
import { AppTagSelector } from '../../components/AppTagSelector';
import { RoleMenu, roleLabel } from './components/RoleMenu';
import { userService } from '../../services';
import type { UserListItem, Role } from '../../types/user';
import type { AppTag } from '../../types/appTag';
import styles from './UsersPage.module.css';

export function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    userService.listRoles().then(setRoles).catch(err => console.error('[UsersPage] roles', err));
  }, []);

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

  const persist = async (user: UserListItem, patch: { roleNames?: string[]; tags?: AppTag[] }) => {
    const roleIds = patch.roleNames
      ? roles.filter(r => patch.roleNames!.includes(r.name)).map(r => r.id)
      : undefined;
    // Оптимистичное обновление
    setUsers(prev => prev.map(u => u.id === user.id ? {
      ...u,
      roles: patch.roleNames ?? u.roles,
      tags: patch.tags ?? u.tags,
    } : u));
    try {
      await userService.update(user.id, { roleIds, tagIds: patch.tags?.map(t => t.id) });
    } catch (err) {
      console.error('[UsersPage] update', err);
    }
  };

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
                  <div className={styles.nameLine}>
                    <span className={styles.name}>{user.name ?? user.email}</span>
                    <RoleMenu
                      allRoles={roles}
                      assigned={user.roles}
                      onChange={roleNames => persist(user, { roleNames })}
                    />
                    {user.roles.map(r => (
                      <span key={r} className={styles.roleBadge}>{roleLabel(r)}</span>
                    ))}
                  </div>
                  <AppTagSelector
                    selectedTags={user.tags}
                    onTagsChange={tags => persist(user, { tags })}
                  />
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
