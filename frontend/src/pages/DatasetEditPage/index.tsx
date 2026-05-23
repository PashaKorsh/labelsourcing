import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { AppTagSelector } from '../../components/AppTagSelector';
import { AnnotationLabelEditor } from './components/AnnotationLabelEditor';
import { RawSettingsEditor } from '../../components/RawSettingsEditor';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ROUTES } from '../../config/routes';
import { datasetService, taskService } from '../../services';
import type { AppTag } from '../../types/appTag';
import type { Tag } from '../../types/annotation';
import type { Dataset } from '../../types/dataset';
import styles from './DatasetEditPage.module.css';

const SHOW_RAW_SETTINGS = import.meta.env.VITE_ENABLE_RAW_SETTINGS === 'true';

interface TaskRow {
  id?: string;
  url: string;
}

export function DatasetEditPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<AppTag[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([{ url: '' }]);
  const [originalTaskIds, setOriginalTaskIds] = useState<string[]>([]);
  const [annotationLabels, setAnnotationLabels] = useState<Tag[]>([]);
  const [requiredAnswers, setRequiredAnswers] = useState<number | ''>('');
  const [validationQuorum, setValidationQuorum] = useState<number | ''>('');
  const [requiresValidation, setRequiresValidation] = useState(false);
  const [defaultLabelingLimit, setDefaultLabelingLimit] = useState<number | ''>('');
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      const rows: TaskRow[] = tasks.map(t => ({ id: t.id, url: t.imageUrl }));
      setTaskRows(rows.length > 0 ? rows : [{ url: '' }]);
      setOriginalTaskIds(tasks.map(t => t.id));
      setAnnotationLabels(ds.annotationLabels ?? []);
      setRequiredAnswers(ds.requiredAnswers ?? '');
      setValidationQuorum(ds.validationQuorum ?? '');
      setRequiresValidation(ds.requiresValidation ?? false);
      setDefaultLabelingLimit(ds.defaultLabelingLimit ?? '');
    }).catch(console.error);
  }, [datasetId]);

  const handleUrlChange = (index: number, value: string) =>
    setTaskRows(prev => prev.map((r, i) => i === index ? { ...r, url: value } : r));

  const addRow = () => setTaskRows(prev => [...prev, { url: '' }]);

  const removeRow = (index: number) =>
    setTaskRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ url: '' }]);

  const handleDelete = async () => {
    if (!datasetId) return;
    try {
      await datasetService.delete(datasetId);
      navigate(ROUTES.myDatasets);
    } catch (err) {
      console.error('[DatasetEditPage] delete', err);
    }
  };

  const handleSave = async () => {
    if (!datasetId || !description.trim()) return;
    setSubmitting(true);
    try {
      await datasetService.update(datasetId, {
        title: title.trim() || undefined,
        description: description.trim(),
        tagIds: selectedTags.map(t => t.id),
        annotationLabels,
        requiredAnswers: requiredAnswers === '' ? undefined : requiredAnswers,
        validationQuorum: validationQuorum === '' ? undefined : validationQuorum,
        requiresValidation,
        defaultLabelingLimit: defaultLabelingLimit === '' ? undefined : defaultLabelingLimit,
        extra,
      });

      const currentIds = new Set(taskRows.filter(r => r.id).map(r => r.id!));
      const deletedIds = originalTaskIds.filter(id => !currentIds.has(id));
      await Promise.all(deletedIds.map(id => taskService.deleteTask(id)));

      const urlsToCreate: string[] = [];
      for (const row of taskRows) {
        if (!row.url.trim()) continue;
        if (!row.id) {
          urlsToCreate.push(row.url.trim());
        } else {
          const origUrl = taskRows.find(r => r.id === row.id)?.url;
          const wasChanged = origUrl !== undefined && origUrl !== row.url.trim();
          if (wasChanged) {
            await taskService.deleteTask(row.id);
            urlsToCreate.push(row.url.trim());
          }
        }
      }
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
          <h2 className={styles.cardTitle}>Метки разметки</h2>
          <AnnotationLabelEditor labels={annotationLabels} onChange={setAnnotationLabels} />
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Параметры разметки</h2>
          <div className={styles.settingsGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Ответов на задание</label>
              <input
                type="number"
                min={1}
                className={styles.input}
                placeholder="1"
                value={requiredAnswers}
                onChange={e => setRequiredAnswers(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Валидаций на ответ</label>
              <input
                type="number"
                min={1}
                className={styles.input}
                placeholder="1"
                value={validationQuorum}
                onChange={e => setValidationQuorum(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Лимит заданий на пользователя</label>
              <input
                type="number"
                min={1}
                className={styles.input}
                placeholder="Без ограничений"
                value={defaultLabelingLimit}
                onChange={e => setDefaultLabelingLimit(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
          </div>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={requiresValidation}
              onChange={e => setRequiresValidation(e.target.checked)}
            />
            Требуется валидация
          </label>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Изображения</h2>
          <div className={styles.field}>
            {taskRows.map((row, i) => (
              <div key={i} className={styles.urlInputRow}>
                <input
                  type="url"
                  className={styles.input}
                  placeholder="https://example.com/image.jpg"
                  value={row.url}
                  onChange={e => handleUrlChange(i, e.target.value)}
                />
                <button
                  type="button"
                  className={styles.removeUrlButton}
                  onClick={() => removeRow(i)}
                  title="Удалить"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className={styles.addUrlButton} onClick={addRow}>
              + Добавить ещё
            </button>
          </div>
        </div>

        {SHOW_RAW_SETTINGS && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Дополнительные настройки</h2>
            <RawSettingsEditor onChange={setExtra} />
          </div>
        )}

        <div className={styles.bottomActions}>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={submitting || !description.trim()}
          >
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => setShowDeleteConfirm(true)}
            disabled={submitting}
          >
            Удалить датасет
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmModal
          message="Удалить датасет безвозвратно? Вместе с ним удалится вся созданная разметка."
          confirmLabel="Удалить"
          cancelLabel="Отмена"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </main>
  );
}
