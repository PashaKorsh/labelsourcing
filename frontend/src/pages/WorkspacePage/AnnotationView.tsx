import { useState, useCallback, useRef, useMemo } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { AnnotationCanvas } from '../../components/AnnotationCanvas';
import { ToolSelector } from '../../components/ToolSelector';
import { TagSelector } from '../../components/TagSelector';
import { HintsBar } from '../../components/HintsBar';
import { CompletedScreen } from '../../components/CompletedScreen';
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
  isExpired: boolean;
  onSaved: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function AnnotationView({ task, hasMoreTasks, tags, isExpired, onSaved, onPrev, onNext }: Props) {
  const [activeTool, setActiveTool] = useState(IMAGE_DRAWING_TOOLS[0].id);
  const [activeTagId, setActiveTagId] = useState<string | null>(tags[0]?.id ?? null);

  const annotationsRef = useRef<ImageAnnotation[]>([]);
  const imageSizeRef = useRef<{ w: number; h: number } | undefined>(undefined);

  const activeTag = tags.find(t => t.id === activeTagId) ?? null;

  const handleAnnotationsChange = useCallback((annotations: ImageAnnotation[]) => {
    annotationsRef.current = annotations;
  }, []);

  const handleImageSizeChange = useCallback((size: { w: number; h: number }) => {
    imageSizeRef.current = size;
  }, []);

  const handleSave = useCallback(async () => {
    if (!task || isExpired) return;
    try {
      await taskService.saveAnnotations(task.id, annotationsRef.current, imageSizeRef.current);
      onSaved();
    } catch (err) {
      if (!(err instanceof Error && err.message.startsWith('410'))) throw err;
    }
  }, [task, isExpired, onSaved]);

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
    <div className={styles.body}>
      <aside className={styles.sidebar}>
        <ToolSelector tools={IMAGE_DRAWING_TOOLS} activeTool={activeTool} onSelect={setActiveTool} />
        <div className={styles.divider} />
        <TagSelector tags={tags} activeTagId={activeTagId} onSelect={setActiveTagId} />
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
                onPrev={onPrev}
                onNext={onNext}
              />
            )
          }
        </div>
        <HintsBar activeTool={activeTool} />
      </main>
    </div>
  );
}
