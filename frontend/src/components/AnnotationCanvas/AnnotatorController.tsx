import { useEffect, useRef } from 'react';
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
  onClose: () => void;
}

export function ContextMenuPortal({ state, onClose }: ContextMenuPortalProps) {
  const anno = useAnnotator<ImageAnnotatorInstance>();

  // Закрыть при клике вне меню
  useEffect(() => {
    window.addEventListener('mousedown', onClose);
    return () => window.removeEventListener('mousedown', onClose);
  }, [onClose]);

  return createPortal(
    <div
      className={styles.contextMenu}
      style={{ left: state.x, top: state.y }}
      onMouseDown={e => e.stopPropagation()} // не закрывать при клике внутри
    >
      <button
        className={styles.contextMenuItem}
        onClick={() => { anno.removeAnnotation(state.annotation); onClose(); }}
      >
        Удалить
      </button>
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
  initialAnnotations: ImageAnnotation[];
  onAnnotationsChange: (annotations: ImageAnnotation[]) => void;
  /** Колбэк для синхронизации hover-состояния с родительским компонентом */
  onHoverChange: (annotation: ImageAnnotation | null) => void;
  contextMenu: ContextMenuState | null;
  onContextMenuClose: () => void;
}

export function AnnotatorController({
  activeTool,
  activeTag,
  initialAnnotations,
  onAnnotationsChange,
  onHoverChange,
  contextMenu,
  onContextMenuClose,
}: AnnotatorControllerProps) {
  const anno = useAnnotator<ImageAnnotatorInstance>();

  // Refs для стабильного доступа к актуальным значениям внутри обработчиков событий
  const activeTagRef = useRef(activeTag);
  const onChangeRef = useRef(onAnnotationsChange);
  const onHoverRef = useRef(onHoverChange);
  useEffect(() => { activeTagRef.current = activeTag; }, [activeTag]);
  useEffect(() => { onChangeRef.current = onAnnotationsChange; }, [onAnnotationsChange]);
  useEffect(() => { onHoverRef.current = onHoverChange; }, [onHoverChange]);

  // Передаём наружу, какая аннотация под курсором (нужно для контекстного меню)
  const hovered = useHover<ImageAnnotation>();
  useEffect(() => { onHoverRef.current(hovered ?? null); }, [hovered]);

  const selection = useSelection<ImageAnnotation>();
  const selectionRef = useRef(selection);
  useEffect(() => { selectionRef.current = selection; }, [selection]);

  // Переключение инструмента рисования
  useEffect(() => {
    if (!anno) return;
    anno.setDrawingTool(activeTool);
  }, [anno, activeTool]);

  // Восстановление сохранённых аннотаций при монтировании (смена таски)
  useEffect(() => {
    if (!anno || initialAnnotations.length === 0) return;
    anno.setAnnotations(initialAnnotations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno]); // только при инициализации anno

  // Привязка активного тега к только что нарисованной аннотации
  useEffect(() => {
    if (!anno) return;
    const handleCreate = (annotation: ImageAnnotation) => {
      const tag = activeTagRef.current;
      if (!tag) return;
      const body: AnnotationBody = {
        id: crypto.randomUUID(),
        annotation: annotation.id,
        purpose: 'classifying',
        value: tag.id,
      };
      anno.updateAnnotation({ ...annotation, bodies: [...annotation.bodies, body] });
    };
    anno.on('createAnnotation', handleCreate);
    return () => anno.off('createAnnotation', handleCreate);
  }, [anno]);

  // Реактивный список аннотаций → передаём в родитель для сохранения
  const annotations = useAnnotations<ImageAnnotation>();
  useEffect(() => { onChangeRef.current(annotations); }, [annotations]);

  // Горячие клавиши
  useEffect(() => {
    if (!anno) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      // Delete / Backspace — удалить выделенные аннотации
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        selectionRef.current.selected.forEach(({ annotation }) => anno.removeAnnotation(annotation));
        return;
      }

      // Ctrl+Z (layout-независимо через event.code — физическое положение клавиши)
      if (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey && e.key !== 'z' && e.key !== 'Z') {
        e.preventDefault(); anno.undo(); return;
      }
      // Ctrl+Shift+Z или Ctrl+Y — повтор
      if (e.ctrlKey && e.code === 'KeyZ' && e.shiftKey && e.key !== 'z' && e.key !== 'Z') {
        e.preventDefault(); anno.redo(); return;
      }
      if (e.ctrlKey && e.code === 'KeyY' && e.key !== 'y' && e.key !== 'Y') {
        e.preventDefault(); anno.redo(); return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [anno]);

  return contextMenu ? (
    <ContextMenuPortal state={contextMenu} onClose={onContextMenuClose} />
  ) : null;
}
