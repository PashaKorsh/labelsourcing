import { useState, useEffect } from 'react';
import { tagService } from '@/services';
import { RoleBadge } from '@/components/RoleBadge';
import type { AppTag } from '@/types/appTag';
import styles from './AppTagPicker.module.css';

interface Props {
  selectedTags: AppTag[];
  onToggle: (tag: AppTag) => void;
}

const MAX_RESULTS = 10;

export function AppTagPicker({ selectedTags, onToggle }: Props) {
  const [search, setSearch] = useState('');
  const [allTags, setAllTags] = useState<AppTag[]>([]);

  useEffect(() => {
    tagService.list().then(setAllTags).catch(console.error);
  }, []);

  const selectedIds = new Set(selectedTags.map(t => t.id));

  const filtered = allTags
    .filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, MAX_RESULTS);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Выбор тегов</h3>

      {selectedTags.length > 0 && (
        <div className={styles.selected}>
          {selectedTags.map(tag => (
            <button key={tag.id} type="button" className={styles.selectedTag} onClick={() => onToggle(tag)}>
              <RoleBadge role={tag} />
              <span className={styles.removeIcon}>✕</span>
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        className={styles.search}
        placeholder="Поиск тега…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />

      <div className={styles.results}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>Теги не найдены</p>
        ) : (
          filtered.map(tag => (
            <button
              key={tag.id}
              type="button"
              className={`${styles.result} ${selectedIds.has(tag.id) ? styles.resultSelected : ''}`}
              onClick={() => onToggle(tag)}
            >
              <span className={styles.swatch} style={{ backgroundColor: tag.color ?? '#d9d9d9' }} />
              <span>{tag.name}</span>
              {selectedIds.has(tag.id) && <span className={styles.check}>✓</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
