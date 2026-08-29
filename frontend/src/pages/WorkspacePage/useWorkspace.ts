import { useState, useEffect, useCallback } from 'react';
import type { AnnotationTask } from '@/types/task';
import type { Tag } from '@/types/annotation';
import { taskService, datasetService } from '@/services';
import { useDatasetId } from '@/hooks/useRouteParams';
import { useIsExpired } from '@/hooks/useIsExpired';

const TASK_BATCH_SIZE = 3;

export function useWorkspace() {
  const datasetId = useDatasetId();

  const [tasks, setTasks] = useState<readonly AnnotationTask[]>([]);
  const [hasMoreTasks, setHasMoreTasks] = useState(true);
  const [tasksLimit, setTasksLimit] = useState<number | null>(null);
  const [taskOffset, setTaskOffset] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allowedTools, setAllowedTools] = useState<string[] | undefined>(undefined);
  const [annotationInstructions, setAnnotationInstructions] = useState<string | null>(null);

  const task = tasks[0] ?? null;
  const isExpired = useIsExpired(task?.expiresAt);

  useEffect(() => {
    if (!datasetId) return;

    // React Router переиспользует WorkspacePage между /dataset/A и /dataset/B (один паттерн
    // маршрута), поэтому при смене датасета кэш и стейт от старого чистим вручную.
    setTasks([]);
    setHasMoreTasks(true);
    setSessionCompleted(0);
    setIsSaved(false);
    setTasksLimit(null);
    setTaskOffset(0);
    setAnnotationInstructions(null);
    taskService.clearCache();

    taskService.loadNextTask(datasetId, TASK_BATCH_SIZE)
      .then(newTask => {
        if (!newTask) setHasMoreTasks(false);
        return datasetService.get(datasetId);
      })
      .then(ds => {
        if (ds.userTasksLimit != null) setTasksLimit(ds.userTasksLimit);
        if (ds.userTasksDone != null) setTaskOffset(ds.userTasksDone);
        const tools = ds.settings?.allowed_tools;
        if (Array.isArray(tools) && tools.length > 0) {
          setAllowedTools(tools as string[]);
        }
        const instr = ds.settings?.annotation_instructions;
        if (typeof instr === 'string' && instr.trim()) {
          setAnnotationInstructions(instr);
        }
        const annotationLabels = Array.isArray(ds.settings?.annotation_labels)
          ? (ds.settings.annotation_labels as typeof tags)
          : [];
        if (annotationLabels.length) {
          const HOTKEYS = '1234567890';
          const withHotkeys = annotationLabels.map((l, i) => ({
            ...l,
            hotkey: i < HOTKEYS.length ? HOTKEYS[i] : undefined,
          }));
          setTags(withHotkeys);
        }
        setTasks(taskService.getTasks());
      })
      .catch(err => {
        console.error('[WorkspacePage] init:', err);
        setTasks(taskService.getTasks());
      });
  }, [datasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const markSaved = useCallback(() => setIsSaved(true), []);

  const goNext = useCallback(async () => {
    if (!task) return;

    taskService.removeFromCache(task.id);

    if (isSaved) setSessionCompleted(prev => prev + 1);
    setIsSaved(false);

    const remaining = taskService.getTasks();

    if (remaining.length > 0) {
      setTasks(remaining);
      if (remaining.length === 1 && hasMoreTasks) {
        taskService.loadNextTask(datasetId ?? '', TASK_BATCH_SIZE)
          .then(newTask => {
            if (!newTask) setHasMoreTasks(false);
            else setTasks(taskService.getTasks());
          })
          .catch(err => console.error('[WorkspacePage] prefetch:', err));
      }
    } else {
      const newTask = await taskService.loadNextTask(datasetId ?? '', TASK_BATCH_SIZE).catch(err => {
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
    tasksLimit,
    allowedTools,
    tags,
    annotationInstructions,
    isExpired,
    canGoNext,
    isSaved,
    markSaved,
    goNext,
  };
}
