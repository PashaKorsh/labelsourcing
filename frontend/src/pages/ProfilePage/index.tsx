import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { RoleBadge } from '../../components/RoleBadge';
import { UtilitiesSection } from './UtilitiesSection';
import { useAuth } from '../../context/auth';
import { hasRole, ROLE_ADMIN, ROLE_MODERATOR } from '../../config/permissions';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const { user, logout } = useAuth();

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />

        {user && (
          <>
            <div className={styles.card}>
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="Аватар пользователя" className={styles.avatar} />
              )}
              <h1 className={styles.name}>{user.name ?? user.email}</h1>
              <p className={styles.email}>{user.email}</p>
              {user.tags.length > 0 && (
                <div className={styles.tags}>
                  {user.tags.map(tag => (
                    <RoleBadge key={tag.id} role={tag} />
                  ))}
                </div>
              )}
              <button type="button" className={styles.logoutButton} onClick={logout}>
                Выйти
              </button>
            </div>

            {hasRole(user.roles, [ROLE_ADMIN, ROLE_MODERATOR]) && <UtilitiesSection />}
          </>
        )}
      </div>
    </main>
  );
}
