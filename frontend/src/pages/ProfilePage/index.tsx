import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { RoleBadge } from '../../components/RoleBadge';
import { useAuth } from '../../context/auth';
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
              {user.tags.map(tag => (
                <RoleBadge key={tag.id} role={tag} />
              ))}
              <button type="button" className={styles.logoutButton} onClick={logout}>
                Выйти
              </button>
            </div>

            <div className={styles.stats}>
              <div className={styles.statCard}>
                <span className={styles.statValue}>42</span>
                <span className={styles.statLabel}>Размечено</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>18</span>
                <span className={styles.statLabel}>Валидировано</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>94%</span>
                <span className={styles.statLabel}>Точность</span>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
