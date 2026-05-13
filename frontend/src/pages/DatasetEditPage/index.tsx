import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { AppTagSelector } from '../../components/AppTagSelector';
import { AnnotationLabelEditor } from './components/AnnotationLabelEditor';
import { ROUTES } from '../../config/routes';
import { datasetService, taskService } from '../../services';
import type { AppTag } from '../../types/appTag';
import type { Tag } from '../../types/annotation';
import type { Dataset } from '../../types/dataset';
import styles from './DatasetEditPage.module.css';

interface TaskRow {
  id?: string;
  url: string;
}

function labelsFingerprint(labels: Tag[]): string {
  return JSON.stringify(
    labels.map(l => ({ id: l.id, label: l.label, color: l.color, hotkey: l.hotkey ?? null })),
  );
}

function tasksFingerprint(rows: TaskRow[]): string {
  return JSON.stringify(
    rows
      .filter(r => r.url.trim())
      .map(r => ({ id: r.id ?? null, url: r.url.trim() })),
  );
}

export function DatasetEditPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<AppTag[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([{ url: '' }]);
  const [originalTaskIds, setOriginalTaskIds] = useState<string[]>([]);
  const [annotationLabels, setAnnotationLabels] = useState<Tag[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveBaseline, setSaveBaseline] = useState<string | null>(null);

  const isLocalAgent = dataset?.sourceType === 'local_agent';
  const showSyncHint = Boolean(
    (location.state as { localAgentSyncHint?: boolean } | null)?.localAgentSyncHint,
  );

  const loadDataset = useCallback(async () => {
    if (!datasetId) return;
    const ds = await datasetService.get(datasetId);
    setDataset(ds);
    setTitle(ds.title ?? '');
    setDescription(ds.description ?? '');
    setSelectedTags(ds.tags);
    setAnnotationLabels(ds.annotationLabels ?? []);

    let tasksForBaseline: string | null = null;

    if (ds.sourceType === 'local_agent') {
      setTaskRows([{ url: '' }]);
      setOriginalTaskIds([]);
    } else {
      const tasks = await datasetService.getTasks(datasetId);
      const rows: TaskRow[] = tasks.map(t => ({ id: t.id, url: t.imageUrl }));
      setTaskRows(rows.length > 0 ? rows : [{ url: '' }]);
      setOriginalTaskIds(tasks.map(t => t.id));
      tasksForBaseline = tasksFingerprint(rows);
    }

    setSaveBaseline(
      JSON.stringify({
        title: (ds.title ?? '').trim(),
        description: (ds.description ?? '').trim(),
        tagIds: [...ds.tags.map(t => t.id)].sort().join(','),
        labels: labelsFingerprint(ds.annotationLabels ?? []),
        tasks: tasksForBaseline,
      }),
    );
  }, [datasetId]);

  useEffect(() => {
    loadDataset().catch(console.error);
  }, [loadDataset]);

  const formFingerprint = useMemo(() => {
    if (!dataset) return null;
    return JSON.stringify({
      title: title.trim(),
      description: description.trim(),
      tagIds: [...selectedTags.map(t => t.id)].sort().join(','),
      labels: labelsFingerprint(annotationLabels),
      tasks: isLocalAgent ? null : tasksFingerprint(taskRows),
    });
  }, [dataset, title, description, selectedTags, annotationLabels, taskRows, isLocalAgent]);

  const isDirty = Boolean(saveBaseline && formFingerprint && formFingerprint !== saveBaseline);

  const handleUrlChange = (index: number, value: string) =>
    setTaskRows(prev => prev.map((r, i) => (i === index ? { ...r, url: value } : r)));

  const addRow = () => setTaskRows(prev => [...prev, { url: '' }]);

  const removeRow = (index: number) =>
    setTaskRows(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ url: '' }]));

  const handleSave = async () => {
    if (!datasetId || !dataset) return;
    setSubmitting(true);
    try {
      await datasetService.update(datasetId, {
        title: title.trim() || undefined,
        description: description.trim(),
        tagIds: selectedTags.map(t => t.id),
        annotationLabels,
      });

      if (!isLocalAgent) {
        const currentIds = new Set(taskRows.filter(r => r.id).map(r => r.id!));
        const deletedIds = originalTaskIds.filter(id => !currentIds.has(id));
        await Promise.all(deletedIds.map(id => taskService.deleteTask(id)));

        const urlsToCreate: string[] = [];
        for (const row of taskRows) {
          if (!row.url.trim()) continue;
          if (!row.id) {
            urlsToCreate.push(row.url.trim());
          } else {
            const orig = taskRows.find(r => r.id === row.id);
            const wasChanged = orig !== undefined && orig.url.trim() !== row.url.trim();
            if (wasChanged) {
              await taskService.deleteTask(row.id);
              urlsToCreate.push(row.url.trim());
            }
          }
        }
        if (urlsToCreate.length > 0) {
          await taskService.createBatch(datasetId, urlsToCreate);
        }
      }

      navigate(ROUTES.myDatasets);
    } catch (err) {
      console.error('[DatasetEditPage]', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!datasetId) return;
    if (!window.confirm('Удалить датасет и все связанные задачи? Это действие необратимо.')) {
      return;
    }
    setDeleting(true);
    try {
      await datasetService.delete(datasetId);
      navigate(ROUTES.myDatasets);
    } catch (err) {
      console.error('[DatasetEditPage] delete', err);
    } finally {
      setDeleting(false);
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

        {showSyncHint && isLocalAgent && (
          <div className={styles.syncHint}>
            <p className={styles.syncHintTitle}>Подключите папку с изображениями</p>
            <p className={styles.syncHintText}>
              Датасет на сайте уже создан — ниже в команде подставлен его ID. На машине с утилитой в другом
              терминале должен работать <code className={styles.inlineCode}>serve</code>. Затем один раз
              выполните:
            </p>
            <code className={styles.codeBlock}>
              python agent.py sync {datasetId} /путь/к/папке/с/картинками
            </code>
          </div>
        )}

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

          {isLocalAgent && (
            <p className={styles.sourceBadge}>
              Источник: локальный агент
              {typeof dataset.taskCount === 'number' ? ` · задач: ${dataset.taskCount}` : ''}
            </p>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Метки разметки</h2>
          <AnnotationLabelEditor labels={annotationLabels} onChange={setAnnotationLabels} />
        </div>

        {!isLocalAgent && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Изображения (URL)</h2>
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
        )}

        {isLocalAgent && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Изображения</h2>
            <p className={styles.localAgentImagesNote}>
              Список файлов задаётся утилитой на вашей машине (команда <code>sync</code>). Здесь
              отображается только число задач; перечислять тысячи путей не нужно.
            </p>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={submitting || !isDirty}
          >
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={handleDelete}
            disabled={deleting || submitting}
          >
            {deleting ? 'Удаление…' : 'Удалить датасет'}
          </button>
        </div>
      </div>
    </main>
  );
}
