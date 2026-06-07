import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { AnnotationCanvas } from '../../components/AnnotationCanvas';
import { ToolSelector } from './components/ToolSelector';
import { TagSelector } from './components/TagSelector';
import { HintsBar } from './components/HintsBar';
import { CompletedScreen } from './components/CompletedScreen';
import { ConfirmModal } from '../../components/ConfirmModal';
import { IMAGE_DRAWING_TOOLS } from '../../tools/imageTools';
import { taskService } from '../../services';
import { useHotkeys } from '../../hooks/useHotkeys';
import type { HotkeyMap } from '../../hooks/useHotkeys';
import type { AnnotationTask } from '../../types/task';
import type { Tag } from '../../types/annotation';
import styles from './AnnotationView.module.css';

interface Props {
  task: AnnotationTask | null;
  hasMoreTasks: boolean;
  tags: Tag[];
  allowedTools?: string[];
  isExpired: boolean;
  isSaved: boolean;
  onSaved: () => void;
  onNext?: () => void;
}

export function AnnotationView({ task, hasMoreTasks, tags, allowedTools, isExpired, isSaved, onSaved, onNext }: Props) {
  // cursor всегда доступен (режим пана), фильтруем только инструменты разметки
  const visibleTools = useMemo(
    () => allowedTools && allowedTools.length > 0
      ? IMAGE_DRAWING_TOOLS.filter(t => t.id === 'cursor' || allowedTools.includes(t.id))
      : IMAGE_DRAWING_TOOLS,
    [allowedTools],
  );

  const [activeTool, setActiveTool] = useState(
    () => visibleTools.find(t => t.id !== 'cursor')?.id ?? visibleTools[0].id,
  );

  // Если после загрузки настроек активный инструмент оказался скрыт — переключаемся
  useEffect(() => {
    if (!visibleTools.find(t => t.id === activeTool)) {
      setActiveTool(visibleTools.find(t => t.id !== 'cursor')?.id ?? visibleTools[0].id);
    }
  }, [visibleTools]); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTagId, setActiveTagId] = useState<string | null>(tags[0]?.id ?? null);

  // При обновлении списка тегов (первая загрузка от бэкенда) сбрасываем activeTagId
  // на первый доступный — иначе activeTag становится null и аннотации без тега/цвета.
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

  const hotkeys = useMemo<HotkeyMap>(() => {
    const map: HotkeyMap = {};
    for (const tool of visibleTools) {
      if (tool.hotkey) map[tool.hotkey] = () => setActiveTool(tool.id);
    }
    for (const tag of tags) {
      if (tag.hotkey) map[tag.hotkey] = () => setActiveTagId(tag.id);
    }
    map['g'] = handleSave;
    return map;
  }, [visibleTools, tags, handleSave]);
  useHotkeys(hotkeys);

  const saveLabel = isSaved
    ? 'Отправлено'
    : (isExpired ? 'Истекло' : 'Отправить');

  const saveTitle = isSaved
    ? 'Разметка отправлена'
    : (isExpired ? 'Время на выполнение истекло' : 'Отправить разметку');

  return (
    <div className={styles.body}>
      <aside className={styles.sidebar}>
        <ToolSelector tools={visibleTools} activeTool={activeTool} onSelect={setActiveTool} />
        <div className={styles.divider} />
        <TagSelector tags={tags} activeTagId={activeTagId} onSelect={setActiveTagId} />
        <div className={styles.sidebarBottom}>
          {saveError && (
            <span className={styles.saveError}>Ошибка сохранения</span>
          )}
          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isSaved || isExpired}
            title={saveTitle}
          >
            {saveLabel}
          </button>
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
        <HintsBar activeTool={activeTool} />
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
