import { useState, useEffect, useCallback, useRef } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { AnnotationCanvas } from '../../components/AnnotationCanvas';
import { ToolSelector } from '../../components/ToolSelector';
import { TagSelector } from '../../components/TagSelector';
import { IMAGE_DRAWING_TOOLS } from '../../tools/imageTools';
import { taskService } from '../../services/taskService';
import { getImageClient } from '../../services/imageClient';
import type { Tag } from '../../types/annotation';
import styles from './WorkspacePage.module.css';

const TAGS: Tag[] = [
  { id: 'person', label: 'Person', color: '#ef4444' },
  { id: 'vehicle', label: 'Vehicle', color: '#3b82f6' },
  { id: 'animal', label: 'Animal', color: '#22c55e' },
  { id: 'object', label: 'Object', color: '#f59e0b' },
];

export function WorkspacePage() {
  const tasks = taskService.getTasks();

  const [taskIndex, setTaskIndex] = useState(0);
  const [activeTool, setActiveTool] = useState(IMAGE_DRAWING_TOOLS[0].id);
  const [activeTagId, setActiveTagId] = useState<string | null>(TAGS[0].id);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Keeps a live reference to the current annotations so we can save them
  // before navigating away without causing re-renders on every change.
  const annotationsRef = useRef<ImageAnnotation[]>([]);

  const task = tasks[taskIndex] ?? null;
  const activeTag = TAGS.find(t => t.id === activeTagId) ?? null;

  // Resolve the image URL whenever the task changes.
  useEffect(() => {
    if (!task) return;
    setImageUrl(null);
    setImageError(null);

    const client = getImageClient(task.locator.source);
    let resolvedUrl: string | null = null;

    client
      .resolve(task.locator)
      .then(url => {
        resolvedUrl = url;
        setImageUrl(url);
      })
      .catch(err => setImageError(String(err)));

    return () => {
      // Release blob: URLs created by clients that implement revoke().
      if (resolvedUrl && client.revoke) {
        client.revoke(resolvedUrl);
      }
    };
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnnotationsChange = useCallback((annotations: ImageAnnotation[]) => {
    annotationsRef.current = annotations;
  }, []);

  const navigateTo = useCallback(
    (nextIndex: number) => {
      if (!task) return;
      // Persist current annotations before leaving.
      taskService.saveAnnotations(task.id, annotationsRef.current);
      setTaskIndex(nextIndex);
    },
    [task],
  );

  const canGoPrev = taskIndex > 0;
  const canGoNext = taskIndex < tasks.length - 1;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Label Sourcing</h1>

        <nav className={styles.taskNav}>
          <button
            className={styles.navButton}
            onClick={() => navigateTo(taskIndex - 1)}
            disabled={!canGoPrev}
            title="Previous task"
          >
            ← Prev
          </button>
          <span className={styles.taskCounter}>
            {task?.name ?? `Task ${taskIndex + 1}`}
            <span className={styles.taskIndex}>
              {taskIndex + 1} / {tasks.length}
            </span>
          </span>
          <button
            className={styles.navButton}
            onClick={() => navigateTo(taskIndex + 1)}
            disabled={!canGoNext}
            title="Next task"
          >
            Next →
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
            tags={TAGS}
            activeTagId={activeTagId}
            onSelect={setActiveTagId}
          />
        </aside>

        <main className={styles.canvasArea}>
          {imageError ? (
            <div className={styles.status}>Failed to load image: {imageError}</div>
          ) : !imageUrl ? (
            <div className={styles.status}>Loading…</div>
          ) : (
            // key={task.id} remounts AnnotationCanvas on task switch,
            // giving Annotorious a fresh instance (and empty undo stack).
            <AnnotationCanvas
              key={task!.id}
              imageUrl={imageUrl}
              activeTool={activeTool}
              activeTag={activeTag}
              tags={TAGS}
              initialAnnotations={taskService.getAnnotations(task!.id)}
              onAnnotationsChange={handleAnnotationsChange}
            />
          )}
        </main>
      </div>
    </div>
  );
}
