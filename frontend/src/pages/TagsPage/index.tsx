import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { RoleBadge } from '../../components/RoleBadge';
import type { Role } from '../../types/role';
import styles from './TagsPage.module.css';

const AVATAR_URL = 'https://picsum.photos/seed/labelsourcing-avatar/80/80';

const MOCK_ROLES: Role[] = [
  { name: 'Медик', color: '#eb5757' },
  { name: 'Пользователь', color: '#d9d9d9' },
];

export function TagsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader title="Теги" avatarUrl={AVATAR_URL} />

        <section className={styles.list}>
          {MOCK_ROLES.map((role) => (
            <div key={role.name} className={styles.row}>
              <div className={styles.colorSwatch} style={{ backgroundColor: role.color }} />
              <RoleBadge role={role} />
              <span className={styles.colorCode}>{role.color}</span>
              <div className={styles.spacer} />
              <button type="button" className={styles.editButton}>Редактировать</button>
              <button type="button" className={styles.deleteButton}>Удалить</button>
            </div>
          ))}
        </section>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Новый тег</h2>
          <div className={styles.createForm}>
            <input type="text" className={styles.input} placeholder="Название тега" />
            <input type="color" className={styles.colorPicker} defaultValue="#6b7280" />
            <button type="button" className={styles.createButton}>Создать</button>
          </div>
        </div>
      </div>
    </main>
  );
}
