import type { ReactNode } from 'react';
import { ContextMenu } from '@/components/AppTagSelector/components/ContextMenu';
import styles from './FilterButton.module.css';

interface FilterButtonProps {
  active: boolean;
  children: ReactNode;
}

export function FilterButton({ active, children }: FilterButtonProps) {
  return (
    <ContextMenu
      trigger={
        <button type="button" className={`${styles.funnel} ${active ? styles.active : ''}`} aria-label="Фильтр">
          ▽
        </button>
      }
    >
      <div className={styles.panel}>{children}</div>
    </ContextMenu>
  );
}

export function FilterSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      {label && <p className={styles.label}>{label}</p>}
      {children}
    </div>
  );
}

export function FilterChips({ children }: { children: ReactNode }) {
  return <div className={styles.chips}>{children}</div>;
}

export function FilterChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`${styles.chip} ${selected ? styles.chipSelected : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
