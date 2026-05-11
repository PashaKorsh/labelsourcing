import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { ReadOnlyAnnotationCanvas } from '../../components/ReadOnlyAnnotationCanvas';
import { taskService } from '../../services';
import { deserializeAnnotations } from '../../utils/annotationDeserializer';
import { useHotkeys } from '../../hooks/useHotkeys';
import type { HotkeyMap } from '../../hooks/useHotkeys';
import type { AnnotationTask } from '../../types/task';
import type { Tag } from '../../types/annotation';
import type { SerializedShape } from '../../utils/annotationSerializer';
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
  tags: Tag[];
  onSaved: () => void;
}

export function ValidationView({ task, tags, onSaved }: Props) {
  const [state, setState] = useState<ValidationState>({
    annotations: [],
    ready: false,
    verdict: null,
    submitting: false,
    submitted: false,
    imageError: null,
  });

  useEffect(() => {
    setState({ annotations: [], ready: false, verdict: null, submitting: false, submitted: false, imageError: null });

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

  const hotkeys = useMemo<HotkeyMap>(() => ({
    s: () => selectVerdict(true),
    a: () => selectVerdict(false),
    g: handleSubmit,
  }), [selectVerdict, handleSubmit]);
  useHotkeys(hotkeys);

  const submitLabel = state.submitted ? 'Отправлено' : (state.submitting ? 'Отправка…' : 'Отправить');

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
      </div>

      <div className={styles.verdictBar}>
        <div className={styles.hints}>
          <span>S — корректно</span>
          <span>A — некорректно</span>
          <span>G — отправить</span>
        </div>
        <div className={styles.buttons}>
          <button
            className={styles.rejectButton}
            data-active={state.verdict === false}
            onClick={() => selectVerdict(false)}
            disabled={state.submitting || state.submitted}
            title="Разметка некорректна (A)"
          >
            ✗ Некорректно
          </button>
          <button
            className={styles.approveButton}
            data-active={state.verdict === true}
            onClick={() => selectVerdict(true)}
            disabled={state.submitting || state.submitted}
            title="Разметка корректна (S)"
          >
            ✓ Корректно
          </button>
          <button
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={state.verdict === null || state.submitting || state.submitted}
            title="Отправить вердикт (Enter)"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
