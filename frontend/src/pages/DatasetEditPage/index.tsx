import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { RoleBadge } from '../../components/RoleBadge';
import type { Role } from '../../types/role';
import styles from './DatasetEditPage.module.css';

const AVAILABLE_ROLES: Role[] = [
  { name: 'Медик', color: '#eb5757' },
  { name: 'Пользователь', color: '#d9d9d9' },
];

export function DatasetEditPage() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />

        <div className={styles.card}>
          <div className={styles.field}>
            <label className={styles.label}>Название</label>
            <input
              type="text"
              className={styles.input}
              placeholder="Введите название датасета"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Описание</label>
            <textarea
              className={styles.textarea}
              placeholder="Краткое описание датасета"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>URL изображения-превью</label>
            <input
              type="text"
              className={styles.input}
              placeholder="https://..."
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Доступные роли</label>
            <div className={styles.roleList}>
              {AVAILABLE_ROLES.map((role) => (
                <label key={role.name} className={styles.roleCheckbox}>
                  <input type="checkbox" />
                  <RoleBadge role={role} />
                </label>
              ))}
            </div>
          </div>

          <button type="button" className={styles.saveButton}>Создать датасет</button>
        </div>
      </div>
    </main>
  );
}
