import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { ReadOnlyAnnotationCanvas } from '../../components/ReadOnlyAnnotationCanvas';
import { validationService } from '../../services/validationService';
import { getImageClient } from '../../services/imageClient';
import { deserializeAnnotations } from '../../services/annotationDeserializer';
import type { ValidationVerdict } from '../../types/validationTask';
import type { Tag } from '../../types/annotation';
import type { AppMode } from '../../types/appMode';
import styles from './ValidationPage.module.css';

// Теги должны совпадать с теми, что используются при разметке,
// чтобы цвета аннотаций отображались корректно.
// TODO: вынести в общий конфиг, получать с сервера вместе с задачами
const TAGS: Tag[] = [
  { id: 'person', label: 'Человек', color: '#ef4444' },
  { id: 'vehicle', label: 'Транспорт', color: '#3b82f6' },
  { id: 'animal', label: 'Животное', color: '#22c55e' },
  { id: 'object', label: 'Объект', color: '#f59e0b' },
];

export interface ValidationPageProps {
  onModeChange: (mode: AppMode) => void;
}

export function ValidationPage({ onModeChange }: ValidationPageProps) {
  const tasks = validationService.getTasks();

  const [taskIndex, setTaskIndex] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Текущий вердикт в локальном состоянии — синхронизируется с сервисом при изменении
  const [currentVerdict, setCurrentVerdict] = useState<ValidationVerdict | null>(null);

  const task = tasks[taskIndex] ?? null;
  const canGoPrev = taskIndex > 0;
  const canGoNext = taskIndex < tasks.length - 1;

  const allJudged = tasks.every(t => validationService.getVerdict(t.id) !== null);

  // Получаем URL изображения при смене задачи
  useEffect(() => {
    if (!task) return;
    setImageUrl(null);
    setImageError(null);
    setImageSize(null);
    setCurrentVerdict(validationService.getVerdict(task.id));

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
      if (resolvedUrl && client.revoke) {
        client.revoke(resolvedUrl);
      }
    };
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Десериализуем аннотации как только известен размер изображения
  const annotations = useMemo<ImageAnnotation[]>(() => {
    if (!imageSize || !task) return [];
    return deserializeAnnotations(task.annotations, imageSize.w, imageSize.h);
  }, [imageSize, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageSizeChange = useCallback((size: { w: number; h: number }) => {
    setImageSize(size);
  }, []);

  const navigateTo = useCallback((nextIndex: number) => {
    setTaskIndex(nextIndex);
  }, []);

  const setVerdict = useCallback((verdict: ValidationVerdict) => {
    if (!task) return;
    validationService.setVerdict(task.id, verdict);
    setCurrentVerdict(verdict);
  }, [task]);

  const handleSubmit = useCallback(async () => {
    await validationService.submit();
    setSubmitted(true);
  }, []);

  // Горячие клавиши для навигации и вердикта
  const taskIndexRef = useRef(taskIndex);
  const currentVerdictRef = useRef(currentVerdict);
  useEffect(() => { taskIndexRef.current = taskIndex; }, [taskIndex]);
  useEffect(() => { currentVerdictRef.current = currentVerdict; }, [currentVerdict]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      if (e.code === 'KeyS' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        setVerdict('approved');
        return;
      }
      if (e.code === 'KeyA' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        setVerdict('rejected');
        return;
      }
      if (e.code === 'KeyD' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        if (taskIndexRef.current > 0) navigateTo(taskIndexRef.current - 1);
        return;
      }
      if (e.code === 'KeyF' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        if (taskIndexRef.current < tasks.length - 1) navigateTo(taskIndexRef.current + 1);
        return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigateTo, setVerdict, tasks.length]);

  if (submitted) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>Label Sourcing</h1>
          <ModeSwitcherInline onModeChange={onModeChange} />
          <div className={styles.headerRight} />
        </header>
        <div className={styles.doneScreen}>
          <div className={styles.doneIcon}>✓</div>
          <p className={styles.doneText}>Результаты валидации отправлены</p>
          <p className={styles.doneSubtext}>
            Оценено {validationService.getResults().length} из {tasks.length} задач
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Label Sourcing</h1>

        <ModeSwitcherInline onModeChange={onModeChange} />

        <nav className={styles.taskNav}>
          <button
            className={styles.navButton}
            onClick={() => navigateTo(taskIndex - 1)}
            disabled={!canGoPrev}
            title="Предыдущая задача (D)"
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
            title="Следующая задача (F)"
          >
            След →
          </button>
        </nav>
      </header>

      <main className={styles.canvasArea}>
        {imageError ? (
          <div className={styles.status}>Не удалось загрузить изображение: {imageError}</div>
        ) : !imageUrl ? (
          <div className={styles.status}>Загрузка…</div>
        ) : (
          // key={task.id} пересоздаёт ReadOnlyAnnotationCanvas при смене задачи
          <ReadOnlyAnnotationCanvas
            key={task!.id}
            imageUrl={imageUrl}
            annotations={annotations}
            tags={TAGS}
            onImageSizeChange={handleImageSizeChange}
          />
        )}
      </main>

      <div className={styles.verdictBar}>
        <div className={styles.verdictHints}>
          <span>S — корректно</span>
          <span>A — некорректно</span>
          <span>D / F — навигация</span>
        </div>

        <div className={styles.verdictButtons}>
          <button
            className={styles.rejectButton}
            data-active={currentVerdict === 'rejected'}
            onClick={() => setVerdict('rejected')}
            title="Разметка некорректна (A)"
          >
            ✗ Некорректно
          </button>

          <div className={styles.verdictProgress}>
            {tasks.map((t, i) => {
              const v = i === taskIndex ? currentVerdict : validationService.getVerdict(t.id);
              return (
                <button
                  key={t.id}
                  className={styles.verdictDot}
                  data-verdict={v ?? 'none'}
                  data-current={i === taskIndex}
                  onClick={() => navigateTo(i)}
                  title={t.name ?? `Задача ${i + 1}`}
                />
              );
            })}
          </div>

          <button
            className={styles.approveButton}
            data-active={currentVerdict === 'approved'}
            onClick={() => setVerdict('approved')}
            title="Разметка корректна (S)"
          >
            ✓ Корректно
          </button>
        </div>

        {allJudged && (
          <button className={styles.submitButton} onClick={handleSubmit}>
            Отправить результаты
          </button>
        )}
      </div>
    </div>
  );
}

// Инлайн-компонент переключения режима, рендерится в шапке
function ModeSwitcherInline({ onModeChange }: { onModeChange: (mode: AppMode) => void }) {
  return (
    <div className={styles.modeSwitcher}>
      <button className={styles.modeButton} onClick={() => onModeChange('annotation')}>
        Разметка
      </button>
      <button className={styles.modeButton} data-active="true">
        Валидация
      </button>
    </div>
  );
}
