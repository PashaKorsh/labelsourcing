import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { RoleBadge } from '../../components/RoleBadge';
import type { Role } from '../../types/role';
import styles from './ProfilePage.module.css';

const AVATAR_URL = 'https://picsum.photos/seed/labelsourcing-profile/200/200';

const MOCK_ROLE: Role = { name: 'Медик', color: '#eb5757' };

export function ProfilePage() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader title="Профиль" avatarUrl={AVATAR_URL} />

        <div className={styles.card}>
          <img src={AVATAR_URL} alt="Аватар пользователя" className={styles.avatar} />
          <h1 className={styles.name}>Иван Иванов</h1>
          <p className={styles.email}>ivan.ivanov@labelsourcing.ru</p>
          <RoleBadge role={MOCK_ROLE} />
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
      </div>
    </main>
  );
}
