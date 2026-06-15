import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { AnnotationCanvas } from '@/components/AnnotationCanvas';
import { ToolSelector } from '../ToolSelector';
import { TagSelector } from '../TagSelector';
import { HintsBar } from '../HintsBar';
import { CompletedScreen } from '../CompletedScreen';
import { ExpiryTimer } from '../ExpiryTimer';
import { ConfirmModal } from '@/components/ConfirmModal';
import { IMAGE_DRAWING_TOOLS } from '@/tools/imageTools';
import { taskService } from '@/services';
import { useHotkeys } from '@/hooks/useHotkeys';
import type { HotkeyMap } from '@/hooks/useHotkeys';
import type { AnnotationTask } from '@/types/task';
import type { Tag } from '@/types/annotation';
import styles from './AnnotationView.module.css';

interface Props {
  task: AnnotationTask | null;
  hasMoreTasks: boolean;
  taskNumber: number;
  tasksLimit: number | null;
  tags: Tag[];
  allowedTools?: string[];
  isExpired: boolean;
  isSaved: boolean;
  onSaved: () => void;
  onNext?: () => void;
}

export function AnnotationView({ task, hasMoreTasks, taskNumber, tasksLimit, tags, allowedTools, isExpired, isSaved, onSaved, onNext }: Props) {
  const visibleTools = useMemo(
    () => allowedTools && allowedTools.length > 0
      ? IMAGE_DRAWING_TOOLS.filter(t => t.id === 'cursor' || allowedTools.includes(t.id))
      : IMAGE_DRAWING_TOOLS,
    [allowedTools],
  );

  const [activeTool, setActiveTool] = useState(
    () => visibleTools.find(t => t.id !== 'cursor')?.id ?? visibleTools[0].id,
  );

  useEffect(() => {
    if (!visibleTools.find(t => t.id === activeTool)) {
      setActiveTool(visibleTools.find(t => t.id !== 'cursor')?.id ?? visibleTools[0].id);
    }
  }, [visibleTools]); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTagId, setActiveTagId] = useState<string | null>(tags[0]?.id ?? null);

  useEffect(() => {
    if (!tags.find(t => t.id === activeTagId)) {
      setActiveTagId(tags[0]?.id ?? null);
    }
  }, [tags]); // eslint-disable-line react-hooks/exhaustive-deps

  const [saveError, setSaveError] = useState(false);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);

  const annotationsRef = useRef<ImageAnnotation[]>([]);
  const imageSizeRef = useRef<{ w: number; h: number } | undefined>(undefined);

  const activeTag = tags.find(t => t.id === activeTagId) ?? null;

  const handleAnnotationsChange = useCallback((annotations: ImageAnnotation[]) => {
    annotationsRef.current = annotations;
  }, []);

  const handleImageSizeChange = useCallback((size: { w: number; h: number }) => {
    imageSizeRef.current = size;
  }, []);

  const doSave = useCallback(async () => {
    if (!task || isExpired) return;
    setShowEmptyConfirm(false);
    setSaveError(false);
    try {
      await taskService.saveAnnotations(task.id, annotationsRef.current, imageSizeRef.current);
      onSaved();
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('410')) return;
      console.error('[AnnotationView] saveAnnotations:', err);
      setSaveError(true);
    }
  }, [task, isExpired, onSaved]);

  const handleSave = useCallback(() => {
    if (!task || isExpired) return;
    if (annotationsRef.current.length === 0) {
      setShowEmptyConfirm(true);
      return;
    }
    doSave();
  }, [task, isExpired, doSave]);

  const canAdvance = isSaved || isExpired;

  const primaryAction = useCallback(() => {
    if (canAdvance) onNext?.();
    else handleSave();
  }, [canAdvance, onNext, handleSave]);

  const hotkeys = useMemo<HotkeyMap>(() => {
    const map: HotkeyMap = {};
    for (const tool of visibleTools) {
      if (tool.hotkey) map[tool.hotkey] = () => setActiveTool(tool.id);
    }
    for (const tag of tags) {
      if (tag.hotkey) map[tag.hotkey] = () => setActiveTagId(tag.id);
    }
    map['g'] = handleSave;
    if (onNext) map['f'] = () => onNext();
    return map;
  }, [visibleTools, tags, handleSave, onNext]);
  useHotkeys(hotkeys);

  const primaryLabel = canAdvance ? 'Следующая →' : 'Отправить';
  const primaryDisabled = canAdvance ? !onNext : false;
  const primaryTitle = canAdvance
    ? (isExpired ? 'Время истекло — следующая задача (F)' : 'Следующая задача (F)')
    : 'Отправить разметку (G)';

  const taskName = (task?.metadata?.name as string | undefined)
    ?? (task ? `Задача ${taskNumber}` : '');

  return (
    <div className={styles.body}>
      <aside className={styles.sidebar}>
        <TagSelector tags={tags} activeTagId={activeTagId} onSelect={setActiveTagId} />
        <div className={styles.legend}>
          <HintsBar activeTool={activeTool} />
        </div>
      </aside>

      <main className={styles.canvasArea}>
        <div className={styles.canvasContent}>
          {!task
            ? (hasMoreTasks ? <div className={styles.status}>Загрузка…</div> : <CompletedScreen />)
            : (
              <AnnotationCanvas
                key={task.id}
                imageUrl={task.imageUrl}
                activeTool={activeTool}
                activeTag={activeTag}
                tags={tags}
                initialAnnotations={taskService.getAnnotations(task.id)}
                onAnnotationsChange={handleAnnotationsChange}
                onImageSizeChange={handleImageSizeChange}
                onNext={onNext}
              />
            )
          }
        </div>

        {task && (
          <div className={styles.toolbar}>
            <div className={styles.taskInfo}>
              <span className={styles.taskName}>{taskName}</span>
              <span className={styles.taskIndex}>
                {taskNumber}{tasksLimit != null ? ` / ${tasksLimit}` : ''}
              </span>
              {task.expiresAt && <ExpiryTimer expiresAt={task.expiresAt} />}
              {saveError && <span className={styles.saveError}>Ошибка сохранения</span>}
            </div>
            <div className={styles.toolbarRow}>
              <div className={styles.tools}>
                <ToolSelector tools={visibleTools} activeTool={activeTool} onSelect={setActiveTool} />
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
        )}

        {showEmptyConfirm && (
          <ConfirmModal
            message="Вы не добавили ни одной аннотации. Отправить пустую разметку?"
            confirmLabel="Отправить"
            cancelLabel="Отмена"
            onConfirm={doSave}
            onCancel={() => setShowEmptyConfirm(false)}
          />
        )}
      </main>
    </div>
  );
}
