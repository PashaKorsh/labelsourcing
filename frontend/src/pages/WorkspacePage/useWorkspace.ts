import { useState, useEffect, useCallback } from 'react';
import type { AnnotationTask } from '../../types/task';
import type { Tag } from '../../types/annotation';
import { taskService, datasetService } from '../../services';
import { useDatasetId } from '../../hooks/useRouteParams';
import { useIsExpired } from '../../hooks/useIsExpired';

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
  const [sessionCompleted, setSessionCompleted] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [tags, setTags] = useState<Tag[]>(DEFAULT_TAGS);

  const task = tasks[0] ?? null;
  const isExpired = useIsExpired(task?.expiresAt);

  useEffect(() => {
    if (!datasetId) return;

    // Сбрасываем весь стейт при смене датасета (или при монтировании).
    // Зависимость [datasetId] критична: React Router v6 не размонтирует WorkspacePage
    // при переходе между /dataset/123 и /dataset/456 — это тот же паттерн маршрута,
    // компонент переиспользуется. Без [datasetId] кэш и стейт от старого датасета
    // остались бы видны на новом, что даёт 400 при попытке повторной отправки.
    setTasks([]);
    setHasMoreTasks(true);
    setSessionCompleted(0);
    setIsSaved(false);
    setLabelingLimit(null);
    setTaskOffset(0);
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
  }, [datasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const markSaved = useCallback(() => setIsSaved(true), []);

  const goNext = useCallback(async () => {
    if (!task) return;

    // Удаляем текущую задачу из кэша — пути назад нет
    taskService.removeFromCache(task.id);

    if (isSaved) setSessionCompleted(prev => prev + 1);
    setIsSaved(false);

    const remaining = taskService.getTasks();

    if (remaining.length > 0) {
      setTasks(remaining);
      // Фоновая догрузка, если буфер почти пуст
      if (remaining.length < 2 && hasMoreTasks) {
        taskService.loadNextTask(datasetId ?? '', 1)
          .then(newTask => {
            if (!newTask) setHasMoreTasks(false);
            else setTasks(taskService.getTasks());
          })
          .catch(err => console.error('[WorkspacePage] prefetch:', err));
      }
    } else {
      const newTask = await taskService.loadNextTask(datasetId ?? '', 1).catch(err => {
        console.error('[WorkspacePage] loadNextTask:', err);
        return null;
      });
      if (newTask) {
        setTasks(taskService.getTasks());
      } else {
        setTasks([]);
        setHasMoreTasks(false);
      }
    }
  }, [task, isSaved, datasetId, hasMoreTasks]);

  const canGoNext = isSaved || isExpired;
  const taskNumber = taskOffset + sessionCompleted + 1;

  return {
    datasetId: datasetId ?? '',
    task,
    taskNumber,
    hasMoreTasks,
    labelingLimit,
    tags,
    isExpired,
    canGoNext,
    isSaved,
    markSaved,
    goNext,
  };
}
