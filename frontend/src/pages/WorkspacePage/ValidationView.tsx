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
    verdict: null,
    submitting: false,
    submitted: false,
    imageError: null,
  });

  // Предзагрузка изображения: нужны натуральные размеры для денормализации координат
  useEffect(() => {
    setState({ annotations: [], verdict: null, submitting: false, submitted: false, imageError: null });

    const serialized = (task.metadata?.annotations ?? []) as SerializedShape[];
    let cancelled = false;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      const annotations = deserializeAnnotations(serialized, img.naturalWidth, img.naturalHeight);
      setState(prev => ({ ...prev, annotations }));
    };

    img.onerror = () => {
      if (cancelled) return;
      setState(prev => ({ ...prev, imageError: `Не удалось загрузить изображение: ${task.imageUrl}` }));
    };

    img.src = task.imageUrl;
    return () => { cancelled = true; };
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerdict = useCallback(async (isCorrect: boolean) => {
    if (state.submitting || state.submitted) return;
    setState(prev => ({ ...prev, verdict: isCorrect, submitting: true }));
    try {
      await taskService.submitValidation(task.id, isCorrect);
      setState(prev => ({ ...prev, submitting: false, submitted: true }));
      onSaved();
    } catch (err) {
      console.error('[ValidationView] submitValidation:', err);
      setState(prev => ({ ...prev, submitting: false }));
    }
  }, [task.id, state.submitting, state.submitted, onSaved]);

  const hotkeys = useMemo<HotkeyMap>(() => ({
    s: () => handleVerdict(true),
    a: () => handleVerdict(false),
  }), [handleVerdict]);
  useHotkeys(hotkeys);

  return (
    <div className={styles.container}>
      <div className={styles.canvasArea}>
        {state.imageError
          ? <div className={styles.status}>{state.imageError}</div>
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
        </div>
        <div className={styles.buttons}>
          <button
            className={styles.rejectButton}
            data-active={state.verdict === false}
            onClick={() => handleVerdict(false)}
            disabled={state.submitting || state.submitted}
            title="Разметка некорректна (A)"
          >
            ✗ Некорректно
          </button>
          <button
            className={styles.approveButton}
            data-active={state.verdict === true}
            onClick={() => handleVerdict(true)}
            disabled={state.submitting || state.submitted}
            title="Разметка корректна (S)"
          >
            ✓ Корректно
          </button>
        </div>
      </div>
    </div>
  );
}
