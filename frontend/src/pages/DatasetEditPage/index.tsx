import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { RoleBadge } from '../../components/RoleBadge';
import { ROUTES } from '../../config/routes';
import { datasetService, tagService } from '../../services';
import type { AppTag } from '../../types/appTag';
import styles from './DatasetEditPage.module.css';

export function DatasetEditPage() {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [availableTags, setAvailableTags] = useState<AppTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    tagService.list().then(setAvailableTags).catch(console.error);
  }, []);

  const toggleTag = (id: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await datasetService.create({ description: description.trim(), tagIds: [...selectedTagIds] });
      navigate(ROUTES.myDatasets);
    } catch (err) {
      console.error('[DatasetEditPage]', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <ModeSwitcher />
        <PageHeader />

        <div className={styles.card}>
          <div className={styles.field}>
            <label className={styles.label}>Описание</label>
            <textarea
              className={styles.textarea}
              placeholder="Краткое описание датасета"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Доступные роли</label>
            <div className={styles.roleList}>
              {availableTags.map((tag) => (
                <label key={tag.id} className={styles.roleCheckbox}>
                  <input
                    type="checkbox"
                    checked={selectedTagIds.has(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                  />
                  <RoleBadge role={{ name: tag.name, color: tag.color ?? '#d9d9d9' }} />
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={styles.saveButton}
            onClick={handleCreate}
            disabled={submitting || !description.trim()}
          >
            {submitting ? 'Создание…' : 'Создать датасет'}
          </button>
        </div>
      </div>
    </main>
  );
}
