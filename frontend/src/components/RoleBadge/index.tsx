import type { Role } from '../../types/role';
import styles from './RoleBadge.module.css';

interface RoleBadgeProps {
  role: Role;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={styles.badge}
      style={{ backgroundColor: `${role.color}33` }}
    >
      {role.name}
    </span>
  );
}
