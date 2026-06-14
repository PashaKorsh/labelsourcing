import { ContextMenu } from '../../../../components/ContextMenu';
import { AppTagPicker } from '../../../../components/AppTagPicker';
import type { AppTag } from '../../../../types/appTag';
import styles from './DatasetFilter.module.css';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Любой' },
  { value: 'NOT_STARTED', label: 'Не начато' },
  { value: 'IN_PROGRESS', label: 'В работе' },
  { value: 'USER_DONE', label: 'Выполнено мной' },
  { value: 'COMPLETED', label: 'Завершён' },
];

interface Props {
  selectedTags: AppTag[];
  status: string;
  onTagsChange: (tags: AppTag[]) => void;
  onStatusChange: (status: string) => void;
}

export function DatasetFilter({ selectedTags, status, onTagsChange, onStatusChange }: Props) {
  const active = selectedTags.length > 0 || status !== '';

  const toggleTag = (tag: AppTag) => {
    onTagsChange(
      selectedTags.some(t => t.id === tag.id)
        ? selectedTags.filter(t => t.id !== tag.id)
        : [...selectedTags, tag],
    );
  };

  return (
    <ContextMenu
      trigger={
        <button type="button" className={`${styles.funnel} ${active ? styles.active : ''}`} aria-label="Фильтр">
          ▽
        </button>
      }
    >
      <div className={styles.panel}>
        <div className={styles.section}>
          <p className={styles.label}>Статус</p>
          <div className={styles.statusList}>
            {STATUS_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                className={`${styles.statusItem} ${status === o.value ? styles.statusSelected : ''}`}
                onClick={() => onStatusChange(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.section}>
          <AppTagPicker selectedTags={selectedTags} onToggle={toggleTag} />
        </div>
      </div>
    </ContextMenu>
  );
}
