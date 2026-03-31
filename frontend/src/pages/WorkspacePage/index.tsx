import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { AnnotationCanvas } from '../../components/AnnotationCanvas';
import { ToolSelector } from '../../components/ToolSelector';
import { TagSelector } from '../../components/TagSelector';
import { IMAGE_DRAWING_TOOLS } from '../../tools/imageTools';
import { taskService } from '../../services/taskService';
import { getImageClient } from '../../services/imageClient';
import type { Tag } from '../../types/annotation';
import { useHotkeys } from '../../hooks/useHotkeys';
import type { HotkeyMap } from '../../hooks/useHotkeys';
import styles from './WorkspacePage.module.css';

const TAGS: Tag[] = [
  { id: 'person', label: 'Человек', color: '#ef4444', hotkey: '1' },
  { id: 'vehicle', label: 'Транспорт', color: '#3b82f6', hotkey: '2' },
  { id: 'animal', label: 'Животное', color: '#22c55e', hotkey: '3' },
  { id: 'object', label: 'Объект', color: '#f59e0b', hotkey: '4' },
];

export function WorkspacePage() {
  const tasks = taskService.getTasks();

  const [taskIndex, setTaskIndex] = useState(0);
  const [activeTool, setActiveTool] = useState(IMAGE_DRAWING_TOOLS[0].id);
  const [activeTagId, setActiveTagId] = useState<string | null>(TAGS[0].id);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Актуальные аннотации без лишних ре-рендеров — для сохранения перед навигацией
  const annotationsRef = useRef<ImageAnnotation[]>([]);

  const task = tasks[taskIndex] ?? null;
  const activeTag = TAGS.find(t => t.id === activeTagId) ?? null;

  // Получаем URL изображения при смене задачи
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
      // Освобождаем blob: URL, если клиент их создаёт
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
      // Сохраняем аннотации перед уходом
      taskService.saveAnnotations(task.id, annotationsRef.current);
      setTaskIndex(nextIndex);
    },
    [task],
  );

  const canGoPrev = taskIndex > 0;
  const canGoNext = taskIndex < tasks.length - 1;

  // Горячие клавиши для инструментов и тегов — берём из их определений
  const hotkeys = useMemo<HotkeyMap>(() => {
    const map: HotkeyMap = {};
    for (const tool of IMAGE_DRAWING_TOOLS) {
      if (tool.hotkey) map[tool.hotkey] = () => setActiveTool(tool.id);
    }
    for (const tag of TAGS) {
      if (tag.hotkey) map[tag.hotkey] = () => setActiveTagId(tag.id);
    }
    return map;
  }, []);
  useHotkeys(hotkeys);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Label Sourcing</h1>

        <nav className={styles.taskNav}>
          <button
            className={styles.navButton}
            onClick={() => navigateTo(taskIndex - 1)}
            disabled={!canGoPrev}
            title="Предыдущая задача"
          >
            ← Пред
          </button>
          <span className={styles.taskCounter}>
            {task?.name ?? `Задача ${taskIndex + 1}`}
            <span className={styles.taskIndex}>
              {taskIndex + 1} / {tasks.length}
            </span>
          </span>
          <button
            className={styles.navButton}
            onClick={() => navigateTo(taskIndex + 1)}
            disabled={!canGoNext}
            title="Следующая задача"
          >
            След →
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
            <div className={styles.status}>Не удалось загрузить изображение: {imageError}</div>
          ) : !imageUrl ? (
            <div className={styles.status}>Загрузка…</div>
          ) : (
            // key={task.id} пересоздаёт AnnotationCanvas при смене задачи,
            // давая Annotorious чистый экземпляр (и пустой стек undo).
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
