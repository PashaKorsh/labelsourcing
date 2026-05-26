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
import { IMAGE_DRAWING_TOOLS } from '../../tools/imageTools';
import type { AppTag } from '../../types/appTag';
import type { Tag } from '../../types/annotation';
import type { Dataset } from '../../types/dataset';
import styles from './DatasetEditPage.module.css';

const ANNOTATION_TOOLS = IMAGE_DRAWING_TOOLS.filter(t => t.id !== 'cursor');
const ALL_TOOL_IDS = ANNOTATION_TOOLS.map(t => t.id);

// Список разрешённых инструментов из настроек; если не задан — все разрешены
const getActiveTools = (s: Record<string, unknown> | null): string[] => {
  const tools = s?.allowed_tools;
  return Array.isArray(tools) ? (tools as string[]) : [...ALL_TOOL_IDS];
};

// Поля settings, которые имеют выделенные поля API и не попадают в settings на бэке
const API_FIELDS = [
  'title', 'description', 'tags', 'annotation_labels',
  'required_answers', 'validation_quorum', 'requires_validation', 'default_tasks_limit',
] as const;

const SHOW_RAW_SETTINGS = import.meta.env.VITE_ENABLE_RAW_SETTINGS === 'true';

interface TaskRow {
  id?: string;
  url: string;
}

export function DatasetEditPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([{ url: '' }]);
  const [originalTaskRows, setOriginalTaskRows] = useState<TaskRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Единый источник правды для всех настроек датасета. Ключи в API_FIELDS + пользовательские поля
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!datasetId) return;
    Promise.all([
      datasetService.get(datasetId),
      datasetService.getTasks(datasetId),
    ]).then(([ds, tasks]) => {
      setDataset(ds);
      const rows: TaskRow[] = tasks.map(t => ({ id: t.id, url: t.imageUrl }));
      setTaskRows(rows.length > 0 ? rows : [{ url: '' }]);
      setOriginalTaskRows(rows);

      // Собираем все поля датасета в единый объект настроек
      const merged: Record<string, unknown> = { ...(ds.settings ?? {}) };
      if (ds.title) merged.title = ds.title;
      merged.description = ds.description;
      if (ds.tags.length > 0) merged.tags = ds.tags;
      if ((ds.annotationLabels ?? []).length > 0) merged.annotation_labels = ds.annotationLabels;
      if (ds.requiredAnswers !== undefined) merged.required_answers = ds.requiredAnswers;
      if (ds.validationQuorum !== undefined) merged.validation_quorum = ds.validationQuorum;
      if (ds.requiresValidation) merged.requires_validation = true;
      if (ds.defaultTasksLimit !== undefined) merged.default_tasks_limit = ds.defaultTasksLimit;
      setSettings(Object.keys(merged).length > 0 ? merged : null);
    }).catch(console.error);
  }, [datasetId]);

  // Записывает или удаляет одно поле в settings
  // (null / undefined / '' / false удаляют ключ)
  const patchSettings = (key: string, value: unknown) => {
    setSettings(prev => {
      const next = { ...(prev ?? {}) };
      if (value === undefined || value === null || value === '' || value === false) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return Object.keys(next).length > 0 ? next : null;
    });
  };

  // Переключение инструмента; нельзя снять последний оставшийся
  const handleToolToggle = (toolId: string, checked: boolean) => {
    const current = getActiveTools(settings);
    const next = checked
      ? [...new Set([...current, toolId])]
      : current.filter(t => t !== toolId);
    if (next.length > 0) patchSettings('allowed_tools', next);
  };

  // Значения для UI-полей — производные от settings
  const title = typeof settings?.title === 'string' ? settings.title : '';
  const description = typeof settings?.description === 'string' ? settings.description : '';
  const selectedTags = Array.isArray(settings?.tags) ? (settings.tags as AppTag[]) : [];
  const annotationLabels = Array.isArray(settings?.annotation_labels) ? (settings.annotation_labels as Tag[]) : [];
  const requiredAnswers = typeof settings?.required_answers === 'number' ? settings.required_answers : '';
  const validationQuorum = typeof settings?.validation_quorum === 'number' ? settings.validation_quorum : '';
  const requiresValidation = settings?.requires_validation === true;
  const defaultTasksLimit = typeof settings?.default_tasks_limit === 'number' ? settings.default_tasks_limit : '';

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
      const s = settings ?? {};

      // Оставшиеся поля (не из API_FIELDS) уходят в settings на бэке
      const extraSettings = Object.fromEntries(
        Object.entries(s).filter(([k]) => !(API_FIELDS as readonly string[]).includes(k)),
      );

      await datasetService.update(datasetId, {
        title: typeof s.title === 'string' ? s.title.trim() || undefined : undefined,
        description: typeof s.description === 'string' ? s.description.trim() : '',
        tagIds: Array.isArray(s.tags) ? (s.tags as AppTag[]).map(t => t.id) : [],
        annotationLabels: Array.isArray(s.annotation_labels) ? (s.annotation_labels as Tag[]) : [],
        requiredAnswers: typeof s.required_answers === 'number' ? s.required_answers : undefined,
        validationQuorum: typeof s.validation_quorum === 'number' ? s.validation_quorum : undefined,
        requiresValidation: s.requires_validation === true ? true : undefined,
        defaultTasksLimit: typeof s.default_tasks_limit === 'number' ? s.default_tasks_limit : undefined,
        settings: Object.keys(extraSettings).length > 0 ? extraSettings : null,
      });

      const currentIds = new Set(taskRows.filter(r => r.id).map(r => r.id!));
      const deletedIds = originalTaskRows
        .filter(r => r.id && !currentIds.has(r.id))
        .map(r => r.id!);
      await Promise.all(deletedIds.map(id => taskService.deleteTask(id)));

      const urlsToCreate: string[] = [];
      for (const row of taskRows) {
        if (!row.url.trim()) continue;
        if (!row.id) {
          urlsToCreate.push(row.url.trim());
        } else {
          const origUrl = originalTaskRows.find(r => r.id === row.id)?.url;
          if (origUrl !== undefined && origUrl !== row.url.trim()) {
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
              onChange={e => patchSettings('title', e.target.value || null)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Описание</label>
            <textarea
              className={styles.textarea}
              placeholder="Описание датасета"
              value={description}
              onChange={e => patchSettings('description', e.target.value || null)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Роли</label>
            <AppTagSelector
              selectedTags={selectedTags}
              onTagsChange={tags => patchSettings('tags', tags.length > 0 ? tags : null)}
            />
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Метки разметки</h2>
          <AnnotationLabelEditor
            labels={annotationLabels}
            onChange={labels => patchSettings('annotation_labels', labels.length > 0 ? labels : null)}
          />
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
                onChange={e => patchSettings('required_answers', e.target.value === '' ? null : Number(e.target.value))}
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
                onChange={e => patchSettings('validation_quorum', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Лимит заданий на пользователя</label>
              <input
                type="number"
                min={1}
                className={styles.input}
                placeholder="Без ограничений"
                value={defaultTasksLimit}
                onChange={e => patchSettings('default_tasks_limit', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Инструменты разметки</label>
            <div className={styles.toolsGroup}>
              {ANNOTATION_TOOLS.map(tool => {
                const activeTools = getActiveTools(settings);
                const isLast = activeTools.length === 1 && activeTools[0] === tool.id;
                return (
                  <label key={tool.id} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={activeTools.includes(tool.id)}
                      disabled={isLast}
                      onChange={e => handleToolToggle(tool.id, e.target.checked)}
                    />
                    {tool.icon} {tool.label}
                  </label>
                );
              })}
            </div>
          </div>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={requiresValidation}
              onChange={e => patchSettings('requires_validation', e.target.checked ? true : null)}
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
            <h2 className={styles.cardTitle}>Все настройки (JSON)</h2>
            <RawSettingsEditor
              value={settings}
              onChange={setSettings}
              hint="Полное отражение всех настроек датасета. Изменения из полей выше отражаются здесь автоматически."
            />
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
