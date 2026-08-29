import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { AppTagSelector } from '@/components/AppTagSelector';
import { AnnotationLabelEditor } from './components/AnnotationLabelEditor';
import { FolderPicker } from './FolderPicker';
import { RawSettingsEditor } from './components/RawSettingsEditor';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ROUTES } from '@/config/routes';
import { datasetService, taskService, utilityService } from '@/services';
import { IMAGE_DRAWING_TOOLS } from '@/tools/imageTools';
import type { AppTag } from '@/types/appTag';
import type { Tag } from '@/types/annotation';
import type { SourceType } from '@/types/dataset';
import type { Utility } from '@/types/utility';
import styles from './DatasetEditPage.module.css';

const ANNOTATION_TOOLS = IMAGE_DRAWING_TOOLS.filter(t => t.id !== 'cursor');
const ALL_TOOL_IDS = ANNOTATION_TOOLS.map(t => t.id);

const getActiveTools = (s: Record<string, unknown> | null): string[] => {
  const tools = s?.allowed_tools;
  return Array.isArray(tools) ? (tools as string[]) : [...ALL_TOOL_IDS];
};

// Эти поля идут отдельными полями API, а не внутрь settings на бэке
const API_FIELDS = [
  'title', 'description', 'tags',
  'required_answers', 'validation_quorum', 'requires_validation', 'default_tasks_limit',
] as const;

const SHOW_RAW_SETTINGS = import.meta.env.VITE_DEV_PANEL === 'true';
const DEFAULT_ANNOTATION_LABEL = { id: 'object', label: 'Object', color: '#f59e0b' };

interface TaskRow {
  id?: string;
  url: string;
}

export function DatasetEditPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const isCreateMode = !datasetId;

  const [isLoading, setIsLoading] = useState(!isCreateMode);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([{ url: '' }]);
  const [originalTaskRows, setOriginalTaskRows] = useState<TaskRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [sourceType, setSourceType] = useState<SourceType>('url');
  const [utilityId, setUtilityId] = useState<string>('');
  const [utilities, setUtilities] = useState<Utility[]>([]);
  const [utilityFolder, setUtilityFolder] = useState<string>('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [scanInfo, setScanInfo] = useState<string>('');

  // Единый источник правды для всех полей датасета (API_FIELDS + пользовательские)
  const [settings, setSettings] = useState<Record<string, unknown> | null>(
    isCreateMode ? { annotation_labels: [DEFAULT_ANNOTATION_LABEL] } : null
  );

  useEffect(() => {
    utilityService.list().then(setUtilities).catch(() => setUtilities([]));
  }, []);

  useEffect(() => {
    if (isCreateMode) return;
    Promise.all([
      datasetService.get(datasetId!),
      datasetService.getTasks(datasetId!),
    ]).then(([ds, tasks]) => {
      const rows: TaskRow[] = tasks.map(t => ({ id: t.id, url: t.imageUrl }));
      setTaskRows(rows.length > 0 ? rows : [{ url: '' }]);
      setOriginalTaskRows(rows);
      setSourceType(ds.sourceType ?? 'url');
      setUtilityId(ds.utilityId ?? '');
      setUtilityFolder(ds.utilityFolder ?? '');

      const merged: Record<string, unknown> = { ...(ds.settings ?? {}) };
      if (ds.title) merged.title = ds.title;
      if (ds.description) merged.description = ds.description;
      if (ds.tags.length > 0) merged.tags = ds.tags;
      if (ds.requiredAnswers !== undefined) merged.required_answers = ds.requiredAnswers;
      if (ds.validationQuorum !== undefined) merged.validation_quorum = ds.validationQuorum;
      if (ds.requiresValidation) merged.requires_validation = true;
      if (ds.defaultTasksLimit !== undefined) merged.default_tasks_limit = ds.defaultTasksLimit;
      setSettings(Object.keys(merged).length > 0 ? merged : null);
    }).catch(console.error).finally(() => setIsLoading(false));
  }, [datasetId, isCreateMode]);

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

  const title = typeof settings?.title === 'string' ? settings.title : '';
  const description = typeof settings?.description === 'string' ? settings.description : '';
  const selectedTags = Array.isArray(settings?.tags) ? (settings.tags as AppTag[]) : [];
  const annotationLabels = Array.isArray(settings?.annotation_labels) ? (settings.annotation_labels as Tag[]) : [];
  const requiredAnswers = typeof settings?.required_answers === 'number' ? settings.required_answers : '';
  const validationQuorum = typeof settings?.validation_quorum === 'number' ? settings.validation_quorum : '';
  const requiresValidation = settings?.requires_validation === true;
  const defaultTasksLimit = typeof settings?.default_tasks_limit === 'number' ? settings.default_tasks_limit : '';
  const annotationInstructions = typeof settings?.annotation_instructions === 'string' ? settings.annotation_instructions : '';

  const handleUrlChange = (index: number, value: string) =>
    setTaskRows(prev => prev.map((r, i) => i === index ? { ...r, url: value } : r));

  const addRow = () => setTaskRows(prev => [...prev, { url: '' }]);

  const removeRow = (index: number) =>
    setTaskRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ url: '' }]);

  const handleFolderPicked = async (path: string) => {
    setShowFolderPicker(false);
    setUtilityFolder(path);
    // При создании датасета ещё нет ID — папку просканируем после создания, в handleSave
    if (!datasetId) {
      setScanInfo('Папка выбрана — будет просканирована при создании датасета.');
      return;
    }
    setScanInfo('Сканирование…');
    try {
      const res = await utilityService.scan(utilityId, datasetId, path);
      setUtilityFolder(res.folder);
      setScanInfo(`Папка привязана: добавлено ${res.added}, всего задач ${res.total}`);
    } catch (e) {
      setScanInfo(`Ошибка сканирования: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleRescan = async () => {
    if (!datasetId) return;
    setScanInfo('Пересканирование…');
    try {
      const res = await utilityService.rescan(utilityId, datasetId);
      setScanInfo(`Готово: добавлено ${res.added}, всего задач ${res.total}`);
    } catch (e) {
      setScanInfo(`Ошибка: ${e instanceof Error ? e.message : e}`);
    }
  };

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
    if (sourceType === 'utility' && !utilityId) {
      window.alert('Выберите утилиту-источник');
      return;
    }
    setSubmitting(true);
    try {
      const s = settings ?? {};

      // Оставшиеся поля (не из API_FIELDS) уходят в settings на бэке
      const extraSettings = Object.fromEntries(
        Object.entries(s).filter(([k]) => !(API_FIELDS as readonly string[]).includes(k)),
      );

      const commonFields = {
        title: typeof s.title === 'string' ? s.title.trim() || undefined : undefined,
        description: typeof s.description === 'string' ? s.description.trim() || null : null,
        tagIds: Array.isArray(s.tags) ? (s.tags as AppTag[]).map(t => t.id) : [],
        requiredAnswers: typeof s.required_answers === 'number' ? s.required_answers : undefined,
        validationQuorum: typeof s.validation_quorum === 'number' ? s.validation_quorum : undefined,
        requiresValidation: s.requires_validation === true,
        defaultTasksLimit: typeof s.default_tasks_limit === 'number' ? s.default_tasks_limit : undefined,
        settings: Object.keys(extraSettings).length > 0 ? extraSettings : undefined,
        sourceType,
        utilityId: sourceType === 'utility' ? utilityId : undefined,
      };

      // Задачи utility-датасета создаёт сама утилита (add-folder), здесь только URL-источник
      const urlsToCreate = sourceType === 'url'
        ? taskRows.filter(r => !r.id && r.url.trim()).map(r => r.url.trim())
        : [];

      if (isCreateMode) {
        const created = await datasetService.create(commonFields);
        if (urlsToCreate.length > 0) {
          await taskService.createBatch(created.id, urlsToCreate);
        }
        // Папку, выбранную на странице создания, сканируем сразу после создания датасета
        if (sourceType === 'utility' && utilityFolder) {
          await utilityService.scan(utilityId, created.id, utilityFolder);
        }
      } else {
        await datasetService.update(datasetId!, { ...commonFields, settings: commonFields.settings ?? null });

        if (sourceType === 'url') {
          const currentIds = new Set(taskRows.filter(r => r.id).map(r => r.id!));
          const deletedIds = originalTaskRows
            .filter(r => r.id && !currentIds.has(r.id))
            .map(r => r.id!);
          await Promise.all(deletedIds.map(id => taskService.deleteTask(id)));

          for (const row of taskRows) {
            if (!row.url.trim() || !row.id) continue;
            const origUrl = originalTaskRows.find(r => r.id === row.id)?.url;
            if (origUrl !== undefined && origUrl !== row.url.trim()) {
              await taskService.deleteTask(row.id);
              urlsToCreate.push(row.url.trim());
            }
          }
          if (urlsToCreate.length > 0) {
            await taskService.createBatch(datasetId!, urlsToCreate);
          }
        }
      }

      navigate(ROUTES.myDatasets);
    } catch (err) {
      console.error('[DatasetEditPage]', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
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
            <label className={styles.label}>Инструкции для разметчиков</label>
            <textarea
              className={styles.textarea}
              placeholder="Правила разметки, которые увидит пользователь перед стартом"
              rows={5}
              value={annotationInstructions}
              onChange={e => patchSettings('annotation_instructions', e.target.value || null)}
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
                placeholder="3"
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
                placeholder="50"
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
          <h2 className={styles.cardTitle}>Источник данных</h2>
          <label className={styles.checkboxRow}>
            <input
              type="radio"
              name="sourceType"
              checked={sourceType === 'url'}
              disabled={!isCreateMode}
              onChange={() => setSourceType('url')}
            />
            Ссылки на изображения (URL)
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="radio"
              name="sourceType"
              checked={sourceType === 'utility'}
              disabled={!isCreateMode}
              onChange={() => setSourceType('utility')}
            />
            Утилита — раздача с вашего компьютера
          </label>

          {sourceType === 'url' && (
            <>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={settings?.use_proxy !== false}
                  onChange={e => setSettings(prev => {
                    const next = { ...(prev ?? {}) };
                    if (e.target.checked) {
                      delete next.use_proxy;
                    } else {
                      next.use_proxy = false;
                    }
                    return Object.keys(next).length > 0 ? next : null;
                  })}
                />
                Загружать изображения через прокси (скрывает оригинальные URL)
              </label>
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
            </>
          )}

          {sourceType === 'utility' && (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Утилита</label>
                <select className={styles.input} value={utilityId} onChange={e => setUtilityId(e.target.value)}>
                  <option value="">— выберите утилиту —</option>
                  {utilities.map(u => (
                    <option key={u.id} value={u.id}>{u.name}{u.online ? ' (в сети)' : ''}</option>
                  ))}
                </select>
                {utilities.length === 0 && (
                  <p className={styles.hint}>Нет привязанных утилит — привяжите в профиле.</p>
                )}
              </div>
              {utilities.find(u => u.id === utilityId)?.publicBaseUrl && (
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={settings?.use_proxy !== false}
                    onChange={e => setSettings(prev => {
                      const next = { ...(prev ?? {}) };
                      if (e.target.checked) delete next.use_proxy;
                      else next.use_proxy = false;
                      return Object.keys(next).length > 0 ? next : null;
                    })}
                  />
                  Раздавать через прокси (выключите — напрямую с вашего сервера)
                </label>
              )}
              <div className={styles.field}>
                {utilityFolder && (
                  <p className={styles.hint}>Папка: <code>{utilityFolder}</code></p>
                )}
                <div className={styles.urlInputRow}>
                  <button
                    type="button"
                    className={styles.addUrlButton}
                    onClick={() => setShowFolderPicker(true)}
                    disabled={!utilityId}
                  >
                    {utilityFolder ? 'Изменить папку' : 'Выбрать папку'}
                  </button>
                  {!isCreateMode && utilityFolder && (
                    <button type="button" className={styles.addUrlButton} onClick={handleRescan}>
                      Пересканировать
                    </button>
                  )}
                </div>
                {!utilityId && (
                  <p className={styles.hint}>Сначала выберите утилиту выше.</p>
                )}
                {scanInfo && <p className={styles.hint}>{scanInfo}</p>}
              </div>
            </>
          )}
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
            disabled={submitting || !title.trim()}
          >
            {submitting
              ? (isCreateMode ? 'Создание…' : 'Сохранение…')
              : (isCreateMode ? 'Создать датасет' : 'Сохранить')}
          </button>
          {!isCreateMode && (
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => setShowDeleteConfirm(true)}
              disabled={submitting}
            >
              Удалить датасет
            </button>
          )}
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

      {showFolderPicker && utilityId && (
        <FolderPicker
          utilityId={utilityId}
          onPick={handleFolderPicked}
          onCancel={() => setShowFolderPicker(false)}
        />
      )}
    </main>
  );
}
