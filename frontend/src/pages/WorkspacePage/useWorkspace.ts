import { useState, useEffect, useCallback } from 'react';
import type { AnnotationTask } from '../../types/task';
import type { Tag } from '../../types/annotation';
import { taskService, datasetService } from '../../services';
import { useDatasetId } from '../../hooks/useRouteParams';
import { useIsExpired } from '../../hooks/useIsExpired';
import { isExpiredAt } from '../../utils/time';

const DEFAULT_TAGS: Tag[] = [
  { id: 'person', label: 'Человек', color: '#ef4444', hotkey: '1' },
  { id: 'vehicle', label: 'Транспорт', color: '#3b82f6', hotkey: '2' },
  { id: 'animal', label: 'Животное', color: '#22c55e', hotkey: '3' },
  { id: 'object', label: 'Объект', color: '#f59e0b', hotkey: '4' },
];

export function useWorkspace() {
  const datasetId = useDatasetId();

  const [tasks, setTasks] = useState<readonly AnnotationTask[]>([]);
  const [hasMoreTasks, setHasMoreTasks] = useState(true);
  const [labelingLimit, setLabelingLimit] = useState<number | null>(null);
  const [taskOffset, setTaskOffset] = useState(0);
  const [taskIndex, setTaskIndex] = useState(0);
  const [savedTaskIds, setSavedTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [tags, setTags] = useState<Tag[]>(DEFAULT_TAGS);

  const task = tasks[taskIndex] ?? null;
  const isExpired = useIsExpired(task?.expiresAt);

  useEffect(() => {
    if (!datasetId) return;

    // Сбрасываем кэш перед загрузкой, чтобы не показывать устаревшие завершённые задачи
    // при возврате на страницу после отправки разметки.
    taskService.clearCache();
    taskService.loadNextTask(datasetId, 3)
      .then(newTask => {
        setTasks(taskService.getTasks());
        if (!newTask) setHasMoreTasks(false);

        return datasetService.get(datasetId);
      })
      .then(ds => {
        if (ds.userLabelingLimit != null) setLabelingLimit(ds.userLabelingLimit);
        if (ds.userLabeledCount != null) setTaskOffset(ds.userLabeledCount);
        if (ds.annotationLabels?.length) {
          const HOTKEYS = '1234567890';
          const withHotkeys = ds.annotationLabels.map((l, i) => ({
            ...l,
            hotkey: i < HOTKEYS.length ? HOTKEYS[i] : undefined,
          }));
          setTags(withHotkeys);
        }
      })
      .catch(err => console.error('[WorkspacePage] init:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markSaved = useCallback((taskId: string) => {
    setSavedTaskIds(prev => new Set(prev).add(taskId));
  }, []);

  const navigateTo = useCallback(async (nextIndex: number) => {
    if (!task) return;

    const isDead = (t: AnnotationTask) => !savedTaskIds.has(t.id) && isExpiredAt(t.expiresAt);
    const cleanedTasks = tasks.filter(t => !isDead(t));
    const removedBefore = tasks.slice(0, nextIndex).filter(isDead).length;
    const adjustedNext = nextIndex - removedBefore;

    if (adjustedNext >= cleanedTasks.length) {
      const newTask = await taskService.loadNextTask(datasetId ?? '', 1).catch(err => {
        console.error('[WorkspacePage] loadNextTask:', err);
        return null;
      });
      if (newTask) {
        const freshTasks = taskService.getTasks().filter(t => !isDead(t));
        setTasks(freshTasks);
        // Если задача уже была в savedTaskIds — она была переиздана после отклонения валидацией.
        // Сбрасываем saved-статус, чтобы кнопка снова стала активной.
        if (savedTaskIds.has(newTask.id)) {
          setSavedTaskIds(prev => { const s = new Set(prev); s.delete(newTask.id); return s; });
        }
        const newIdx = freshTasks.findIndex(t => t.id === newTask.id);
        setTaskIndex(newIdx >= 0 ? newIdx : adjustedNext);
      } else {
        if (cleanedTasks.length !== tasks.length) setTasks(cleanedTasks);
        setHasMoreTasks(false);
        setTaskIndex(adjustedNext);
      }
    } else {
      if (cleanedTasks.length !== tasks.length) setTasks(cleanedTasks);
      setTaskIndex(adjustedNext);
    }
  }, [task, tasks, savedTaskIds, datasetId]);

  const isCurrentTaskSaved = task ? savedTaskIds.has(task.id) : false;
  const canGoPrev = taskIndex > 0;
  const canGoNext = (isCurrentTaskSaved || isExpired) && (taskIndex < tasks.length - 1 || hasMoreTasks);

  return {
    datasetId: datasetId ?? '',
    task,
    tasks,
    taskIndex,
    taskOffset,
    hasMoreTasks,
    labelingLimit,
    tags,
    isExpired,
    canGoPrev,
    canGoNext,
    isCurrentTaskSaved,
    markSaved,
    navigateTo,
  };
}
