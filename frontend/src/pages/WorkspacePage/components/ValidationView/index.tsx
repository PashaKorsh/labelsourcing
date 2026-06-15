import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { ReadOnlyAnnotationCanvas } from '@/components/ReadOnlyAnnotationCanvas';
import { ExpiryTimer } from '../ExpiryTimer';
import { taskService } from '@/services';
import { deserializeAnnotations } from '@/utils/annotationDeserializer';
import { useHotkeys } from '@/hooks/useHotkeys';
import type { HotkeyMap } from '@/hooks/useHotkeys';
import type { AnnotationTask } from '@/types/task';
import type { Tag } from '@/types/annotation';
import type { SerializedShape } from '@/utils/annotationSerializer';
import styles from './ValidationView.module.css';

interface ValidationState {
  annotations: ImageAnnotation[];
  ready: boolean;
  verdict: boolean | null;
  submitting: boolean;
  submitted: boolean;
  imageError: string | null;
}

interface Props {
  task: AnnotationTask;
  taskNumber: number;
  tasksLimit: number | null;
  tags: Tag[];
  isSaved: boolean;
  onSaved: () => void;
  onNext?: () => void;
}

export function ValidationView({ task, taskNumber, tasksLimit, tags, isSaved, onSaved, onNext }: Props) {
  const [state, setState] = useState<ValidationState>({
    annotations: [],
    ready: false,
    verdict: null,
    submitting: false,
    submitted: isSaved,
    imageError: null,
  });

  useEffect(() => {
    setState({ annotations: [], ready: false, verdict: null, submitting: false, submitted: isSaved, imageError: null });

    const serialized = (task.metadata?.annotations ?? []) as SerializedShape[];
    let cancelled = false;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      const annotations = deserializeAnnotations(serialized, img.naturalWidth, img.naturalHeight);
      setState(prev => ({ ...prev, annotations, ready: true }));
    };

    img.onerror = () => {
      if (cancelled) return;
      setState(prev => ({ ...prev, imageError: `Не удалось загрузить изображение: ${task.imageUrl}` }));
    };

    img.src = task.imageUrl;
    return () => { cancelled = true; };
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectVerdict = useCallback((isCorrect: boolean) => {
    if (state.submitting || state.submitted) return;
    setState(prev => ({ ...prev, verdict: isCorrect }));
  }, [state.submitting, state.submitted]);

  const handleSubmit = useCallback(async () => {
    if (state.verdict === null || state.submitting || state.submitted) return;
    setState(prev => ({ ...prev, submitting: true }));
    try {
      await taskService.submitValidation(task.id, state.verdict);
      setState(prev => ({ ...prev, submitting: false, submitted: true }));
      onSaved();
    } catch (err) {
      console.error('[ValidationView] submitValidation:', err);
      setState(prev => ({ ...prev, submitting: false }));
    }
  }, [task.id, state.verdict, state.submitting, state.submitted, onSaved]);

  const primaryAction = useCallback(() => {
    if (state.submitted) onNext?.();
    else handleSubmit();
  }, [state.submitted, onNext, handleSubmit]);

  const hotkeys = useMemo<HotkeyMap>(() => ({
    s: () => selectVerdict(true),
    a: () => selectVerdict(false),
    g: handleSubmit,
    ...(onNext ? { f: onNext } : {}),
  }), [selectVerdict, handleSubmit, onNext]);
  useHotkeys(hotkeys);

  const primaryLabel = state.submitted ? 'Следующая →' : (state.submitting ? 'Отправка…' : 'Отправить');
  const primaryDisabled = state.submitted ? !onNext : (state.verdict === null || state.submitting);
  const primaryTitle = state.submitted ? 'Следующая задача (F)' : 'Отправить вердикт (G)';

  const taskName = (task.metadata?.name as string | undefined) ?? `Задача ${taskNumber}`;

  return (
    <div className={styles.container}>
      <div className={styles.canvasArea}>
        {state.imageError
          ? <div className={styles.status}>{state.imageError}</div>
          : !state.ready
            ? <div className={styles.status}>Загрузка…</div>
            : (
              <ReadOnlyAnnotationCanvas
                key={task.id}
                imageUrl={task.imageUrl}
                initialAnnotations={state.annotations}
                tags={tags}
              />
            )
        }

        <div className={styles.toolbar}>
          <div className={styles.taskInfo}>
            <span className={styles.taskName}>{taskName}</span>
            <span className={styles.validationBadge}>Валидация</span>
            <span className={styles.taskIndex}>
              {taskNumber}{tasksLimit != null ? ` / ${tasksLimit}` : ''}
            </span>
            {task.expiresAt && <ExpiryTimer expiresAt={task.expiresAt} />}
          </div>
          <div className={styles.toolbarRow}>
            <div className={styles.verdicts}>
              <button
                className={styles.rejectButton}
                data-active={state.verdict === false}
                onClick={() => selectVerdict(false)}
                disabled={state.submitting || state.submitted}
                title="Разметка некорректна (A)"
              >
                ✗
              </button>
              <button
                className={styles.approveButton}
                data-active={state.verdict === true}
                onClick={() => selectVerdict(true)}
                disabled={state.submitting || state.submitted}
                title="Разметка корректна (S)"
              >
                ✓
              </button>
            </div>
            <button
              className={styles.primaryButton}
              onClick={primaryAction}
              disabled={primaryDisabled}
              title={primaryTitle}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
