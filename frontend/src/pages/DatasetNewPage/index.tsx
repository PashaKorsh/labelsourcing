import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { AppTagSelector } from '@/components/AppTagSelector';
import { ROUTES } from '@/config/routes';
import { datasetService } from '@/services';
import type { AppTag } from '@/types/appTag';
import styles from './DatasetNewPage.module.css';

export function DatasetNewPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<AppTag[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await datasetService.create({
        title: title.trim() || undefined,
        description: description.trim(),
        tagIds: selectedTags.map(t => t.id),
      });
      navigate(ROUTES.myDatasets);
    } catch (err) {
      console.error('[DatasetNewPage]', err);
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
            <label className={styles.label}>Название</label>
            <input
              type="text"
              className={styles.input}
              placeholder="Название набора"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

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
            <label className={styles.label}>Роли</label>
            <AppTagSelector selectedTags={selectedTags} onTagsChange={setSelectedTags} />
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
