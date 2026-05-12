import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useAnnotator,
  useAnnotations,
  useHover,
  useSelection,
} from '@annotorious/react';
import type { ImageAnnotator as ImageAnnotatorInstance } from '@annotorious/annotorious';
import type { ImageAnnotation, AnnotationBody } from '@annotorious/annotorious';
import type { Tag } from '../../types/annotation';
import type { ContextMenuState } from './types';
import styles from './AnnotationCanvas.module.css';

// ─── Контекстное меню ─────────────────────────────────────────────────────────
// Рендерится через portal в document.body, чтобы не попасть под
// CSS-трансформации канваса. Находится внутри <Annotorious>, поэтому
// имеет доступ к useAnnotator.

interface ContextMenuPortalProps {
  state: ContextMenuState;
  tags: Tag[];
  onClose: () => void;
}

export function ContextMenuPortal({ state, tags, onClose }: ContextMenuPortalProps) {
  const anno = useAnnotator<ImageAnnotatorInstance>();
  const [tagListOpen, setTagListOpen] = useState(false);

  // Закрыть при клике вне меню
  useEffect(() => {
    window.addEventListener('mousedown', onClose);
    return () => window.removeEventListener('mousedown', onClose);
  }, [onClose]);

  const currentTag = tags.find(t =>
    state.annotation.bodies.some(b => b.purpose === 'classifying' && b.value === t.id)
  ) ?? null;

  const changeTag = (tag: Tag) => {
    const bodies = [
      ...state.annotation.bodies.filter(b => b.purpose !== 'classifying'),
      { id: crypto.randomUUID(), annotation: state.annotation.id, purpose: 'classifying' as const, value: tag.id },
    ];
    anno.updateAnnotation({ ...state.annotation, bodies });
    onClose();
  };

  return createPortal(
    <div
      className={styles.contextMenu}
      style={{ left: state.x, top: state.y }}
      onMouseDown={e => e.stopPropagation()}
    >
      <button
        className={styles.contextMenuItem}
        onClick={() => { anno.removeAnnotation(state.annotation); onClose(); }}
      >
        Удалить
      </button>

      <div className={styles.contextMenuDivider} />

      <button
        className={styles.contextMenuTagRow}
        onClick={() => setTagListOpen(v => !v)}
      >
        <span className={styles.contextMenuTagDot} style={{ background: currentTag?.color ?? '#666' }} />
        <span className={styles.contextMenuTagLabel}>{currentTag?.label ?? 'Без тега'}</span>
        <span className={styles.contextMenuTagArrow}>{tagListOpen ? '▴' : '▾'}</span>
      </button>

      {tagListOpen && tags.map(tag => (
        <button
          key={tag.id}
          className={styles.contextMenuTagItem}
          data-active={tag.id === currentTag?.id}
          onClick={() => changeTag(tag)}
        >
          <span className={styles.contextMenuTagDot} style={{ background: tag.color }} />
          {tag.label}
          {tag.id === currentTag?.id && <span className={styles.contextMenuTagCheck}>✓</span>}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ─── Контроллер ───────────────────────────────────────────────────────────────
// Компонент без визуала, живёт внутри <Annotorious> и управляет его
// экземпляром через useAnnotator(). Сюда вынесена вся императивная логика.

export interface AnnotatorControllerProps {
  activeTool: string;
  activeTag: Tag | null;
  tags: Tag[];
  initialAnnotations: ImageAnnotation[];
  sizeReady: boolean;
  onAnnotationsChange: (annotations: ImageAnnotation[]) => void;
  /** Колбэк для синхронизации hover-состояния с родительским компонентом */
  onHoverChange: (annotation: ImageAnnotation | null) => void;
  contextMenu: ContextMenuState | null;
  onContextMenuClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function AnnotatorController({
  activeTool,
  activeTag,
  tags,
  initialAnnotations,
  sizeReady,
  onAnnotationsChange,
  onHoverChange,
  contextMenu,
  onContextMenuClose,
  onPrev,
  onNext,
}: AnnotatorControllerProps) {
  const anno = useAnnotator<ImageAnnotatorInstance>();

  // Refs для стабильного доступа к актуальным значениям внутри обработчиков событий
  const activeTagRef = useRef(activeTag);
  const onChangeRef = useRef(onAnnotationsChange);
  const onHoverRef = useRef(onHoverChange);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  useEffect(() => { activeTagRef.current = activeTag; }, [activeTag]);
  useEffect(() => { onChangeRef.current = onAnnotationsChange; }, [onAnnotationsChange]);
  useEffect(() => { onHoverRef.current = onHoverChange; }, [onHoverChange]);
  useEffect(() => { onPrevRef.current = onPrev; }, [onPrev]);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);

  // Передаём наружу, какая аннотация под курсором (нужно для контекстного меню)
  const hovered = useHover<ImageAnnotation>();
  useEffect(() => { onHoverRef.current(hovered ?? null); }, [hovered]);

  const selection = useSelection<ImageAnnotation>();
  const selectionRef = useRef(selection);
  useEffect(() => { selectionRef.current = selection; }, [selection]);

  // Переключение инструмента рисования
  useEffect(() => {
    if (!anno) return;
    if (activeTool === 'cursor') {
      anno.setDrawingEnabled(false);
    } else {
      anno.setDrawingEnabled(true);
      anno.setDrawingTool(activeTool as Parameters<typeof anno.setDrawingTool>[0]);
    }
  }, [anno, activeTool]);

  // Восстановление сохранённых аннотаций — ждём и anno, и sizeReady,
  // чтобы displayStyle уже был применён к <img>. rAF даёт ResizeObserver Annotorious
  // один тик на пересчёт масштаба до передачи аннотаций.
  useEffect(() => {
    if (!anno || !sizeReady || initialAnnotations.length === 0) return;
    const raf = requestAnimationFrame(() => {
      anno.setAnnotations(initialAnnotations);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno, sizeReady]); // initialAnnotations стабильны благодаря key на родителе

  // Привязка активного тега к только что нарисованной аннотации
  useEffect(() => {
    if (!anno) return;
    const handleCreate = (annotation: ImageAnnotation) => {
      const tag = activeTagRef.current;
      if (!tag) return;
      if (annotation.bodies.some(b => b.purpose === 'classifying')) return;
      const body: AnnotationBody = {
        id: crypto.randomUUID(),
        annotation: annotation.id,
        purpose: 'classifying',
        value: tag.id,
      };
      anno.updateAnnotation({ ...annotation, bodies: [...annotation.bodies, body] });
    };
    // Проверка нужна: Annotorious стреляет createAnnotation и при redo,
    // восстанавливая уже помеченную аннотацию. Без проверки updateAnnotation
    // создаёт новую запись в истории и обнуляет redo-стек.
    anno.on('createAnnotation', handleCreate);
    return () => anno.off('createAnnotation', handleCreate);
  }, [anno]);

  // Реактивный список аннотаций → передаём в родитель для сохранения
  const annotations = useAnnotations<ImageAnnotation>();
  useEffect(() => { onChangeRef.current(annotations); }, [annotations]);

  // Горячие клавиши
  useEffect(() => {
    if (!anno) return;

    // Флаг: следующий keydown — синтетический Delete для вершины полигона,
    // наш обработчик должен его пропустить (dispatchEvent синхронный).
    let skipNextDelete = false;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      // Синтетический Delete от S-клавиши — пропускаем, Annotorious обработает сам
      if (skipNextDelete) { skipNextDelete = false; return; }

      // Delete / Backspace / A — удалить выделенные аннотации целиком
      if (e.key === 'Delete' || e.key === 'Backspace' || e.code === 'KeyA' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        selectionRef.current.selected.forEach(({ annotation }) => anno.removeAnnotation(annotation));
        return;
      }

      // S — удалить вершину полигона (только если активен редактор вершин)
      // dispatchEvent синхронный: флаг выставляем до диспатча, сбрасываем внутри обработчика
      if (e.code === 'KeyS' && !e.ctrlKey && !e.shiftKey) {
        const layer = document.querySelector('.a9s-annotationlayer');
        if (layer && document.querySelector('.a9s-polygon-editor-mask')) {
          e.preventDefault();
          skipNextDelete = true;
          layer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
        }
        return;
      }

      // Z — отмена (+ Ctrl+Z как алиас)
      if ((e.code === 'KeyZ' && !e.ctrlKey && !e.shiftKey) || (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey)) {
        e.preventDefault(); anno.undo(); return;
      }
      // X — повтор (+ Ctrl+Shift+Z / Ctrl+Y как алиасы)
      if ((e.code === 'KeyX' && !e.ctrlKey && !e.shiftKey)
        || (e.ctrlKey && e.code === 'KeyZ' && e.shiftKey)
        || (e.ctrlKey && e.code === 'KeyY')) {
        e.preventDefault(); anno.redo(); return;
      }

      // D — предыдущая задача, F — следующая
      if (e.code === 'KeyD' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault(); onPrevRef.current?.(); return;
      }
      if (e.code === 'KeyF' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault(); onNextRef.current?.(); return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [anno]);

  return contextMenu ? (
    <ContextMenuPortal state={contextMenu} tags={tags} onClose={onContextMenuClose} />
  ) : null;
}
