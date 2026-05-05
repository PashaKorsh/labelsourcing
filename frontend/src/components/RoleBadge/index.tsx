import type { AppTag } from '../../types/appTag';
import styles from './RoleBadge.module.css';

interface RoleBadgeProps {
  role: AppTag;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={styles.badge}
      style={{ backgroundColor: `${role.color ?? '#d9d9d9'}33` }}
    >
      {role.name}
    </span>
  );
}
