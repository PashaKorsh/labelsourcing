import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Annotorious, ImageAnnotator, useAnnotator, useHover, useSelection } from '@annotorious/react';
import { UserSelectAction } from '@annotorious/annotorious';
import type { ImageAnnotation } from '@annotorious/annotorious';
import type { ImageAnnotator as ImageAnnotatorInstance } from '@annotorious/annotorious';
import type { Tag } from '@/types/annotation';
import { useCanvasBase } from '../AnnotationCanvas/useCanvasBase';
import { buildTagStyler } from '../AnnotationCanvas/buildTagStyler';
import '@annotorious/react/annotorious-react.css';
import styles from './ReadOnlyAnnotationCanvas.module.css';

// ─── Контекстное меню (только просмотр тега) ──────────────────────────────────
// Рендерится через portal в document.body, чтобы не попасть под CSS-трансформации канваса.

interface PortalTagMenuProps {
  state: { x: number; y: number; annotation: ImageAnnotation };
  tags: Tag[];
  onClose: () => void;
}

function PortalTagMenu({ state, tags, onClose }: PortalTagMenuProps) {
  useEffect(() => {
    window.addEventListener('mousedown', onClose);
    return () => window.removeEventListener('mousedown', onClose);
  }, [onClose]);

  const tag = tags.find(t =>
    state.annotation.bodies.some(b => b.purpose === 'classifying' && b.value === t.id)
  ) ?? null;

  return createPortal(
    <div
      className={styles.contextMenu}
      style={{ left: state.x, top: state.y }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className={styles.contextMenuTagRow}>
        <span
          className={styles.contextMenuTagDot}
          style={{ background: tag?.color ?? '#666' }}
        />
        <span className={styles.contextMenuTagLabel}>
          {tag?.label ?? 'Без тега'}
        </span>
      </div>
    </div>,
    document.body,
  );
}

// ─── Контроллер ───────────────────────────────────────────────────────────────
// Живёт внутри <Annotorious>. Устанавливает аннотации, отслеживает hover
// и пробрасывает его наружу для контекстного меню.

function ReadOnlyController({
  initialAnnotations,
  sizeReady,
  onHoverChange,
  onAnnotationSelect,
}: {
  initialAnnotations: ImageAnnotation[];
  sizeReady: boolean;
  onHoverChange: (annotation: ImageAnnotation | null) => void;
  onAnnotationSelect: (annotation: ImageAnnotation, x: number, y: number) => void;
}) {
  const anno = useAnnotator<ImageAnnotatorInstance>();
  const onHoverRef = useRef(onHoverChange);
  const onSelectRef = useRef(onAnnotationSelect);
  useEffect(() => { onHoverRef.current = onHoverChange; }, [onHoverChange]);
  useEffect(() => { onSelectRef.current = onAnnotationSelect; }, [onAnnotationSelect]);

  useEffect(() => {
    if (!anno) return;
    anno.setDrawingEnabled(false);
  }, [anno]);

  useEffect(() => {
    if (!anno || !sizeReady || initialAnnotations.length === 0) return;
    // Двойной rAF: ResizeObserver Annotorious и первый rAF могут оказаться в одном фрейме.
    // Второй rAF гарантирует, что первый фрейм (с пересчётом масштаба) уже завершён.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        anno.setAnnotations(initialAnnotations);
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno, sizeReady]); // initialAnnotations стабильны благодаря key на родителе

  const hovered = useHover<ImageAnnotation>();
  useEffect(() => { onHoverRef.current(hovered ?? null); }, [hovered]);

  // ЛКМ по аннотации — selection.event содержит координаты клика
  const selection = useSelection<ImageAnnotation>();
  useEffect(() => {
    if (selection.selected.length === 0 || !selection.event) return;
    const event = selection.event;
    if (!(event instanceof PointerEvent) || event.button !== 0) return;
    const { annotation } = selection.selected[0];
    onSelectRef.current(annotation, event.clientX, event.clientY);
  }, [selection]);

  return null;
}

export interface ReadOnlyAnnotationCanvasProps {
  imageUrl: string;
  initialAnnotations: ImageAnnotation[];
  tags: Tag[];
}

export function ReadOnlyAnnotationCanvas({
  imageUrl,
  initialAnnotations,
  tags,
}: ReadOnlyAnnotationCanvasProps) {
  const {
    wrapperRef,
    zoom,
    panX,
    panY,
    reset,
    originalSize,
    displayStyle,
    handleHoverChange,
    contextMenu,
    setContextMenu,
    handleContextMenu,
  } = useCanvasBase(imageUrl, true);

  const handleAnnotationSelect = useCallback((annotation: ImageAnnotation, x: number, y: number) => {
    setContextMenu({ x, y, annotation });
  }, [setContextMenu]);

  const tagStyler = buildTagStyler(tags, 0.25);

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      style={{ cursor: 'grab' }}
      onContextMenu={handleContextMenu}
    >
      <div className={styles.zoomIndicator}>
        <span>{Math.round(zoom * 100)}%</span>
        {zoom !== 1 && (
          <button className={styles.zoomReset} onClick={reset} title="Сбросить зум">⊙</button>
        )}
      </div>

      <div
        className={styles.scene}
        style={{ transform: `translate(${panX}px, ${panY}px)` }}
      >
        <Annotorious>
          <ImageAnnotator
            style={tagStyler}
            drawingEnabled={false}
            userSelectAction={UserSelectAction.SELECT}
            containerClassName={styles.annotoriousContainer}
          >
            <img
              src={imageUrl}
              className={styles.image}
              style={displayStyle}
              alt="Annotation target"
              draggable={false}
              crossOrigin="anonymous"
            />
          </ImageAnnotator>
          <ReadOnlyController
            initialAnnotations={initialAnnotations}
            sizeReady={originalSize !== null}
            onHoverChange={handleHoverChange}
            onAnnotationSelect={handleAnnotationSelect}
          />
          {contextMenu && (
            <PortalTagMenu
              state={contextMenu}
              tags={tags}
              onClose={() => setContextMenu(null)}
            />
          )}
        </Annotorious>
      </div>
    </div>
  );
}
