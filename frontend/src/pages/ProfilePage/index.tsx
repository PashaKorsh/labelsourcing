import { useState, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { RoleBadge } from '../../components/RoleBadge';
import { userService } from '../../services';
import type { UserProfile } from '../../types/user';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    userService.getMe().then(setProfile).catch(console.error);
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />

        {profile && (
          <>
            <div className={styles.card}>
              {profile.avatarUrl && (
                <img src={profile.avatarUrl} alt="Аватар пользователя" className={styles.avatar} />
              )}
              <h1 className={styles.name}>{profile.name ?? profile.email}</h1>
              <p className={styles.email}>{profile.email}</p>
              {profile.tags.map(tag => (
                <RoleBadge key={tag.id} role={tag} />
              ))}
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
