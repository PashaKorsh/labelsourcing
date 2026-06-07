import type { Tag } from '../../../../types/annotation';
import styles from './TagSelector.module.css';

interface Props {
  tags: Tag[];
  activeTagId: string | null;
  onSelect: (tagId: string) => void;
}

export function TagSelector({ tags, activeTagId, onSelect }: Props) {
  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Tags</h3>
      <ul className={styles.list}>
        {tags.map(tag => (
          <li key={tag.id}>
            <button
              className={`${styles.button} ${activeTagId === tag.id ? styles.active : ''}`}
              onClick={() => onSelect(tag.id)}
              title={tag.hotkey ? `${tag.label}  [${tag.hotkey}]` : tag.label}
            >
              <span
                className={styles.swatch}
                style={{ backgroundColor: tag.color }}
              />
              {tag.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
