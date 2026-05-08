import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { AnnotationCanvas } from '../../components/AnnotationCanvas';
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
import { useHotkeys } from '../../hooks/useHotkeys';
import type { HotkeyMap } from '../../hooks/useHotkeys';
import { isExpiredAt } from '../../utils/time';
import styles from './WorkspacePage.module.css';
import { ModeSwitcher } from '../../components/ModeSwitcher';
import { CompletedScreen } from '../../components/CompletedScreen';

const DEFAULT_TAGS: Tag[] = [
  { id: 'person', label: 'Человек', color: '#ef4444', hotkey: '1' },
  { id: 'vehicle', label: 'Транспорт', color: '#3b82f6', hotkey: '2' },
  { id: 'animal', label: 'Животное', color: '#22c55e', hotkey: '3' },
  { id: 'object', label: 'Объект', color: '#f59e0b', hotkey: '4' },
];

export function WorkspacePage() {
  const datasetId = useDatasetId();
  // Мок инициализирует задачи сразу; API-сервис начинает с пустого списка.
  const [tasks, setTasks] = useState<readonly AnnotationTask[]>(() => taskService.getTasks());
  const [hasMoreTasks, setHasMoreTasks] = useState(true);
  const [labelingLimit, setLabelingLimit] = useState<number | null>(null);
  const [taskIndex, setTaskIndex] = useState(0);
  const [savedTaskIds, setSavedTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [activeTool, setActiveTool] = useState(IMAGE_DRAWING_TOOLS[0].id);
  const [tags, setTags] = useState<Tag[]>(DEFAULT_TAGS);
  const [activeTagId, setActiveTagId] = useState<string | null>(DEFAULT_TAGS[0].id);

  const annotationsRef = useRef<ImageAnnotation[]>([]);
  const imageSizeRef = useRef<{ w: number; h: number } | undefined>(undefined);

  const task = tasks[taskIndex] ?? null;
  const activeTag = tags.find(t => t.id === activeTagId) ?? null;

  // Вычисляется реактивно из expiresAt и текущего времени — не хранит ручное состояние.
  // Корректно обновляется при навигации между задачами без сброса через useEffect.
  const isExpired = useIsExpired(task?.expiresAt);

  // Загружаем метки разметки из датасета и первую задачу при монтировании.
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

  const handleAnnotationsChange = useCallback((annotations: ImageAnnotation[]) => {
    annotationsRef.current = annotations;
  }, []);

  const handleImageSizeChange = useCallback((size: { w: number; h: number }) => {
    imageSizeRef.current = size;
  }, []);

  const isCurrentTaskSaved = task ? savedTaskIds.has(task.id) : false;

  const navigateTo = useCallback(async (nextIndex: number) => {
    if (!task) return;

    // Удаляем истёкшие несохранённые задачи из массива перед навигацией
    const isDead = (t: AnnotationTask) => !savedTaskIds.has(t.id) && isExpiredAt(t.expiresAt);
    const cleanedTasks = tasks.filter(t => !isDead(t));
    const removedBefore = tasks.slice(0, nextIndex).filter(isDead).length;
    const adjustedNext = nextIndex - removedBefore;

    // Если нужно догружать — делаем это до setTasks, чтобы не мелькал CompletedScreen
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
      // 410 — задание истекло; isExpired обновится само через useIsExpired
    }
  }, [task, isExpired]);

  const canGoPrev = taskIndex > 0;
  // Вперёд — если задача сохранена ИЛИ истекла (пользователь должен иметь возможность уйти)
  const canGoNext = (isCurrentTaskSaved || isExpired) && (taskIndex < tasks.length - 1 || hasMoreTasks);

  const hotkeys = useMemo<HotkeyMap>(() => {
    const map: HotkeyMap = {};
    for (const tool of IMAGE_DRAWING_TOOLS) {
      if (tool.hotkey) map[tool.hotkey] = () => setActiveTool(tool.id);
    }
    for (const tag of tags) {
      if (tag.hotkey) map[tag.hotkey] = () => setActiveTagId(tag.id);
    }
    return map;
  }, [tags]);
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
            {(task?.metadata?.name as string | undefined) ?? `Задача ${taskIndex + 1}`}
            <span className={styles.taskIndex}>
              {taskIndex + 1} / {labelingLimit ?? tasks.length}
            </span>
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
    </div>
  );
}
