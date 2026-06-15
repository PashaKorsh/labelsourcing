import { useEffect, useState, useCallback } from 'react';
import { utilityService } from '@/services';
import type { DirListing } from '@/types/utility';
import styles from './FolderPicker.module.css';

interface Props {
  utilityId: string;
  onPick: (path: string) => void;
  onCancel: () => void;
}

export function FolderPicker({ utilityId, onPick, onCancel }: Props) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const open = useCallback((path: string) => {
    setLoading(true);
    setError('');
    utilityService.listDirs(utilityId, path)
      .then(setListing)
      .catch(() => setError('Не удалось получить список папок (утилита в сети?)'))
      .finally(() => setLoading(false));
  }, [utilityId]);

  useEffect(() => { open(''); }, [open]);

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>Выбор папки на машине с утилитой</h3>

        {listing && (
          <div className={styles.pathRow}>
            <span className={styles.currentPath}>{listing.path || 'Корни'}</span>
            {listing.parent !== null && (
              <button type="button" className={styles.upButton} onClick={() => open(listing.parent!)}>
                ↑ Вверх
              </button>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
        {loading && <p className={styles.muted}>Загрузка…</p>}

        {listing && !loading && (
          <ul className={styles.list}>
            {listing.dirs.length === 0 && <li className={styles.muted}>Вложенных папок нет</li>}
            {listing.dirs.map(d => (
              <li key={d.path} className={styles.item}>
                <button type="button" className={styles.dirButton} onClick={() => open(d.path)}>
                  📁 {d.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.pickButton}
            disabled={!listing?.path}
            onClick={() => listing && onPick(listing.path)}
          >
            Выбрать эту папку{listing && listing.imageCount > 0 ? ` (${listing.imageCount} изобр.)` : ''}
          </button>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
