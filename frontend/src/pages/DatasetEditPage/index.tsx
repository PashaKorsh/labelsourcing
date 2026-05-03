import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { AppTagSelector } from '../../components/AppTagSelector';
import { ROUTES } from '../../config/routes';
import { datasetService, taskService } from '../../services';
import type { AppTag } from '../../types/appTag';
import type { Dataset } from '../../types/dataset';
import type { AnnotationTask } from '../../types/task';
import styles from './DatasetEditPage.module.css';

export function DatasetEditPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<AppTag[]>([]);
  const [existingTasks, setExistingTasks] = useState<AnnotationTask[]>([]);
  const [newUrls, setNewUrls] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    Promise.all([
      datasetService.get(datasetId),
      datasetService.getTasks(datasetId),
    ]).then(([ds, tasks]) => {
      setDataset(ds);
      setTitle(ds.title ?? '');
      setDescription(ds.description);
      setSelectedTags(ds.tags);
      setExistingTasks(tasks);
    }).catch(console.error);
  }, [datasetId]);

  const handleUrlChange = (index: number, value: string) => {
    setNewUrls(prev => prev.map((u, i) => i === index ? value : u));
  };

  const addUrlField = () => setNewUrls(prev => [...prev, '']);

  const removeUrlField = (index: number) =>
    setNewUrls(prev => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!datasetId || !description.trim()) return;
    setSubmitting(true);
    try {
      await datasetService.update(datasetId, {
        title: title.trim() || undefined,
        description: description.trim(),
        tagIds: selectedTags.map(t => t.id),
      });

      const urlsToCreate = newUrls.filter(u => u.trim());
      if (urlsToCreate.length > 0) {
        await taskService.createBatch(datasetId, urlsToCreate);
      }

      navigate(ROUTES.myDatasets);
    } catch (err) {
      console.error('[DatasetEditPage]', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!dataset) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <ModeSwitcher />
          <PageHeader />
          <p>Загрузка…</p>
        </div>
      </main>
    );
  }

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
              placeholder="Описание датасета"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Роли</label>
            <AppTagSelector selectedTags={selectedTags} onTagsChange={setSelectedTags} />
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Изображения</h2>

          {existingTasks.length > 0 && (
            <div className={styles.existingUrls}>
              {existingTasks.map(task => (
                <div key={task.id} className={styles.existingUrlRow}>
                  <span className={styles.urlText}>{task.imageUrl}</span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Добавить изображения</label>
            {newUrls.map((url, i) => (
              <div key={i} className={styles.urlInputRow}>
                <input
                  type="url"
                  className={styles.input}
                  placeholder="https://example.com/image.jpg"
                  value={url}
                  onChange={e => handleUrlChange(i, e.target.value)}
                />
                {newUrls.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeUrlButton}
                    onClick={() => removeUrlField(i)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className={styles.addUrlButton} onClick={addUrlField}>
              + Добавить ещё
            </button>
          </div>
        </div>

        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSave}
          disabled={submitting || !description.trim()}
        >
          {submitting ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </main>
  );
}
