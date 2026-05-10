import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { AnnotationCanvas } from '../../components/AnnotationCanvas';
import { ReadOnlyAnnotationCanvas } from '../../components/ReadOnlyAnnotationCanvas';
import { ToolSelector } from '../../components/ToolSelector';
import { TagSelector } from '../../components/TagSelector';
import { HintsBar } from '../../components/HintsBar';
import { ExpiryTimer } from '../../components/ExpiryTimer';
import { IMAGE_DRAWING_TOOLS } from '../../tools/imageTools';
import { taskService, datasetService } from '../../services';
import { useDatasetId } from '../../hooks/useRouteParams';
import { useIsExpired } from '../../hooks/useIsExpired';
import type { AnnotationTask } from '../../types/task';
import type { Tag } from '../../types/annotation';
import type { SerializedShape } from '../../utils/annotationSerializer';
import { deserializeAnnotations } from '../../utils/annotationDeserializer';
import { useHotkeys } from '../../hooks/useHotkeys';
import type { HotkeyMap } from '../../hooks/useHotkeys';
import { isExpiredAt } from '../../utils/time';
import { ROUTES, buildRoute } from '../../config/routes';
import styles from './WorkspacePage.module.css';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { CompletedScreen } from '../../components/CompletedScreen';

const DEFAULT_TAGS: Tag[] = [
  { id: 'person', label: 'Человек', color: '#ef4444', hotkey: '1' },
  { id: 'vehicle', label: 'Транспорт', color: '#3b82f6', hotkey: '2' },
  { id: 'animal', label: 'Животное', color: '#22c55e', hotkey: '3' },
  { id: 'object', label: 'Объект', color: '#f59e0b', hotkey: '4' },
];

interface ValidationState {
  annotations: ImageAnnotation[];
  verdict: boolean | null; // true = approved, false = rejected
  submitting: boolean;
  imageError: string | null;
}

function makeEmptyValidation(): ValidationState {
  return { annotations: [], verdict: null, submitting: false, imageError: null };
}

export function WorkspacePage() {
  const datasetId = useDatasetId();
  const navigate = useNavigate();
  const location = useLocation();
  const [tasks, setTasks] = useState<readonly AnnotationTask[]>(() => taskService.getTasks());
  const [hasMoreTasks, setHasMoreTasks] = useState(true);
  const [labelingLimit, setLabelingLimit] = useState<number | null>(null);
  const [taskOffset, setTaskOffset] = useState(0);
  const [taskIndex, setTaskIndex] = useState(0);
  const [savedTaskIds, setSavedTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [activeTool, setActiveTool] = useState(IMAGE_DRAWING_TOOLS[0].id);
  const [tags, setTags] = useState<Tag[]>(DEFAULT_TAGS);
  const [activeTagId, setActiveTagId] = useState<string | null>(DEFAULT_TAGS[0].id);
  const [validationState, setValidationState] = useState<ValidationState>(makeEmptyValidation);

  const annotationsRef = useRef<ImageAnnotation[]>([]);
  const imageSizeRef = useRef<{ w: number; h: number } | undefined>(undefined);

  const task = tasks[taskIndex] ?? null;
  const activeTag = tags.find(t => t.id === activeTagId) ?? null;
  const isValidationTask = task?.type === 'validation';

  const isExpired = useIsExpired(task?.expiresAt);

  // Синхронизируем URL с типом текущей задачи
  useEffect(() => {
    if (!datasetId || !task) return;
    const isOnValidationRoute = location.pathname.endsWith('/validation');
    if (task.type === 'validation' && !isOnValidationRoute) {
      navigate(buildRoute(ROUTES.datasetValidation, { datasetId }), { replace: true });
    } else if (task.type !== 'validation' && isOnValidationRoute) {
      navigate(buildRoute(ROUTES.datasetAnnotation, { datasetId }), { replace: true });
    }
  }, [task?.id, task?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!datasetId) return;

    taskService.loadNextTask(datasetId, 3)
      .then(newTask => {
        if (newTask) setTasks(taskService.getTasks());
        else setHasMoreTasks(false);

        return datasetService.get(datasetId);
      })
      .then(ds => {
        if (ds.userLabelingLimit != null) setLabelingLimit(ds.userLabelingLimit);
        if (ds.userLabeledCount != null) setTaskOffset(ds.userLabeledCount);
        if (ds.annotationLabels && ds.annotationLabels.length > 0) {
          const HOTKEYS = '1234567890';
          const withHotkeys = ds.annotationLabels.map((l, i) => ({
            ...l,
            hotkey: i < HOTKEYS.length ? HOTKEYS[i] : undefined,
          }));
          setTags(withHotkeys);
          setActiveTagId(withHotkeys[0].id);
        }
      })
      .catch(err => console.error('[WorkspacePage] init:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // При смене validation-задачи: предзагружаем изображение и десериализуем аннотации.
  // Предзагрузка нужна, чтобы знать натуральный размер изображения до монтирования холста.
  useEffect(() => {
    if (!task || !isValidationTask) return;

    setValidationState(makeEmptyValidation());

    const annotations = (task.metadata?.annotations ?? []) as SerializedShape[];
    const url = task.imageUrl;
    let cancelled = false;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      const deserialized = deserializeAnnotations(annotations, img.naturalWidth, img.naturalHeight);
      setValidationState(prev => ({ ...prev, annotations: deserialized }));
    };

    img.onerror = () => {
      if (cancelled) return;
      setValidationState(prev => ({ ...prev, imageError: `Не удалось загрузить изображение: ${url}` }));
    };

    img.src = url;
    return () => { cancelled = true; };
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnnotationsChange = useCallback((annotations: ImageAnnotation[]) => {
    annotationsRef.current = annotations;
  }, []);

  const handleImageSizeChange = useCallback((size: { w: number; h: number }) => {
    imageSizeRef.current = size;
  }, []);

  const isCurrentTaskSaved = task ? savedTaskIds.has(task.id) : false;

  const navigateTo = useCallback(async (nextIndex: number) => {
    if (!task) return;

    const isDead = (t: AnnotationTask) => !savedTaskIds.has(t.id) && isExpiredAt(t.expiresAt);
    const cleanedTasks = tasks.filter(t => !isDead(t));
    const removedBefore = tasks.slice(0, nextIndex).filter(isDead).length;
    const adjustedNext = nextIndex - removedBefore;

    if (adjustedNext >= cleanedTasks.length) {
      const newTask = await taskService.loadNextTask(datasetId ?? '').catch(err => {
        console.error('[WorkspacePage] loadNextTask:', err);
        return null;
      });
      if (newTask) {
        setTasks(taskService.getTasks().filter(t => !isDead(t)));
      } else {
        if (cleanedTasks.length !== tasks.length) setTasks(cleanedTasks);
        setHasMoreTasks(false);
      }
    } else if (cleanedTasks.length !== tasks.length) {
      setTasks(cleanedTasks);
    }

    setTaskIndex(adjustedNext);
  }, [task, tasks, savedTaskIds, datasetId]);

  const handleSave = useCallback(async () => {
    if (!task || isExpired) return;
    try {
      await taskService.saveAnnotations(task.id, annotationsRef.current, imageSizeRef.current);
      setSavedTaskIds(prev => new Set(prev).add(task.id));
    } catch (err) {
      if (!(err instanceof Error && err.message.startsWith('410'))) throw err;
    }
  }, [task, isExpired]);

  const handleValidationVerdict = useCallback(async (isCorrect: boolean) => {
    if (!task || validationState.submitting) return;
    setValidationState(prev => ({ ...prev, verdict: isCorrect, submitting: true }));
    try {
      await taskService.submitValidation(task.id, isCorrect);
      setSavedTaskIds(prev => new Set(prev).add(task.id));
    } catch (err) {
      console.error('[WorkspacePage] submitValidation:', err);
    } finally {
      setValidationState(prev => ({ ...prev, submitting: false }));
    }
  }, [task, validationState.submitting]);

  const canGoPrev = taskIndex > 0;
  const canGoNext = (isCurrentTaskSaved || isExpired) && (taskIndex < tasks.length - 1 || hasMoreTasks);

  const hotkeys = useMemo<HotkeyMap>(() => {
    const map: HotkeyMap = {};
    if (!isValidationTask) {
      for (const tool of IMAGE_DRAWING_TOOLS) {
        if (tool.hotkey) map[tool.hotkey] = () => setActiveTool(tool.id);
      }
      for (const tag of tags) {
        if (tag.hotkey) map[tag.hotkey] = () => setActiveTagId(tag.id);
      }
    } else {
      map['s'] = () => handleValidationVerdict(true);
      map['a'] = () => handleValidationVerdict(false);
    }
    return map;
  }, [isValidationTask, tags, handleValidationVerdict]);
  useHotkeys(hotkeys);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Label Sourcing</h1>

        <ModeSwitcher />

        <nav className={styles.taskNav}>
          <button
            className={styles.navButton}
            onClick={() => navigateTo(taskIndex - 1)}
            disabled={!canGoPrev}
            title="Предыдущая задача"
          >
            ← Пред
          </button>
          <span className={styles.taskCounter}>
            {task ? (
              <>
                {(task.metadata?.name as string | undefined) ?? `Задача ${taskOffset + taskIndex + 1}`}
                {isValidationTask && <span className={styles.validationBadge}>Валидация</span>}
                <span className={styles.taskIndex}>
                  {taskOffset + taskIndex + 1} / {labelingLimit ?? tasks.length}
                </span>
              </>
            ) : 'Готово'}
            {task?.expiresAt && <ExpiryTimer expiresAt={task.expiresAt} />}
          </span>
          <button
            className={styles.navButton}
            onClick={() => navigateTo(taskIndex + 1)}
            disabled={!canGoNext}
            title="Следующая задача"
          >
            След →
          </button>
        </nav>
      </header>

      {isValidationTask ? (
        // ── Validation mode ────────────────────────────────────────
        <div className={styles.validationBody}>
          <div className={styles.validationCanvasArea}>
            {validationState.imageError ? (
              <div className={styles.status}>{validationState.imageError}</div>
            ) : (
              <ReadOnlyAnnotationCanvas
                key={task!.id}
                imageUrl={task!.imageUrl}
                initialAnnotations={validationState.annotations}
                tags={tags}
              />
            )}
          </div>

          <div className={styles.verdictBar}>
            <div className={styles.verdictHints}>
              <span>S — корректно</span>
              <span>A — некорректно</span>
              <span>D / F — навигация</span>
            </div>
            <div className={styles.verdictButtons}>
              <button
                className={styles.rejectButton}
                data-active={validationState.verdict === false}
                onClick={() => handleValidationVerdict(false)}
                disabled={validationState.submitting}
                title="Разметка некорректна (A)"
              >
                ✗ Некорректно
              </button>
              <button
                className={styles.approveButton}
                data-active={validationState.verdict === true}
                onClick={() => handleValidationVerdict(true)}
                disabled={validationState.submitting}
                title="Разметка корректна (S)"
              >
                ✓ Корректно
              </button>
            </div>
          </div>
        </div>
      ) : (
        // ── Annotation mode ────────────────────────────────────────
        <div className={styles.body}>
          <aside className={styles.sidebar}>
            <ToolSelector
              tools={IMAGE_DRAWING_TOOLS}
              activeTool={activeTool}
              onSelect={setActiveTool}
            />
            <div className={styles.divider} />
            <TagSelector
              tags={tags}
              activeTagId={activeTagId}
              onSelect={setActiveTagId}
            />
            <div className={styles.sidebarBottom}>
              <button
                className={styles.saveButton}
                onClick={handleSave}
                disabled={isExpired}
                title={isExpired ? 'Время на выполнение задания истекло' : 'Сохранить разметку'}
              >
                {isExpired ? 'Истекло' : 'Сохранить'}
              </button>
            </div>
          </aside>

          <main className={styles.canvasArea}>
            <div className={styles.canvasContent}>
              {!task ? (
                tasks.length === 0 && hasMoreTasks
                  ? <div className={styles.status}>Загрузка…</div>
                  : <CompletedScreen />
              ) : (
                <AnnotationCanvas
                  key={task.id}
                  imageUrl={task.imageUrl}
                  activeTool={activeTool}
                  activeTag={activeTag}
                  tags={tags}
                  initialAnnotations={taskService.getAnnotations(task.id)}
                  onAnnotationsChange={handleAnnotationsChange}
                  onImageSizeChange={handleImageSizeChange}
                  onPrev={canGoPrev ? () => navigateTo(taskIndex - 1) : undefined}
                  onNext={canGoNext ? () => navigateTo(taskIndex + 1) : undefined}
                />
              )}
            </div>
            <HintsBar activeTool={activeTool} />
          </main>
        </div>
      )}
    </div>
  );
}
