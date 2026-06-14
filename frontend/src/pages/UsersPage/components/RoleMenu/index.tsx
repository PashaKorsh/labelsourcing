import { ContextMenu } from '../../../../components/ContextMenu';
import type { Role } from '../../../../types/user';
import styles from './RoleMenu.module.css';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Админ',
  moderator: 'Модератор',
};

export function roleLabel(name: string): string {
  return ROLE_LABELS[name] ?? name;
}

interface Props {
  allRoles: Role[];
  assigned: string[];               // имена назначенных ролей
  onChange: (roleNames: string[]) => void;
}

export function RoleMenu({ allRoles, assigned, onChange }: Props) {
  const toggle = (name: string) => {
    onChange(
      assigned.includes(name)
        ? assigned.filter(r => r !== name)
        : [...assigned, name],
    );
  };

  return (
    <ContextMenu
      trigger={
        <button type="button" className={styles.gear} title="Роли" aria-label="Роли">
          ⚙
        </button>
      }
    >
      <div className={styles.menu}>
        {allRoles.map(role => (
          <button
            key={role.id}
            type="button"
            className={styles.item}
            onClick={() => toggle(role.name)}
          >
            <span className={styles.check}>{assigned.includes(role.name) ? '✓' : ''}</span>
            {roleLabel(role.name)}
          </button>
        ))}
      </div>
    </ContextMenu>
  );
}
