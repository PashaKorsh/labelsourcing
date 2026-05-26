import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Annotorious, ImageAnnotator, useAnnotator, useHover, useSelection } from '@annotorious/react';
import { UserSelectAction } from '@annotorious/annotorious';
import type { ImageAnnotation, DrawingStyle } from '@annotorious/annotorious';
import type { ImageAnnotator as ImageAnnotatorInstance } from '@annotorious/annotorious';
import type { Tag } from '../../types/annotation';
import type { ContextMenuState } from '../AnnotationCanvas/types';
import { useZoomPan } from '../AnnotationCanvas/useZoomPan';
import '@annotorious/react/annotorious-react.css';
import styles from './ReadOnlyAnnotationCanvas.module.css';

function buildTagStyler(tags: Tag[]) {
  return (annotation: ImageAnnotation): DrawingStyle | undefined => {
    const body = annotation.bodies.find(b => b.purpose === 'classifying');
    const tag = tags.find(t => t.id === body?.value);
    if (!tag) return undefined;
    const color = tag.color as DrawingStyle['fill'];
    return { fill: color, fillOpacity: 0.25, stroke: color, strokeWidth: 2 };
  };
}

// ─── Контекстное меню (только просмотр тега) ──────────────────────────────────
// Рендерится через portal в document.body, чтобы не попасть под CSS-трансформации канваса.

interface TagContextMenuPortalProps {
  state: ContextMenuState;
  tags: Tag[];
  onClose: () => void;
}

function TagContextMenuPortal({ state, tags, onClose }: TagContextMenuPortalProps) {
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panRef = useRef(true);
  const { zoom, panX, panY, reset } = useZoomPan(wrapperRef, panRef);

  const [originalSize, setOriginalSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setOriginalSize(null);
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      const nw = probe.naturalWidth;
      const nh = probe.naturalHeight;
      if (!nw || !nh) return;
      const scale = Math.min(1, (window.innerWidth * 0.8) / nw, (window.innerHeight * 0.8) / nh);
      setOriginalSize({ w: Math.round(nw * scale), h: Math.round(nh * scale) });
    };
    probe.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl]);

  const displayStyle = originalSize
    ? {
        width: originalSize.w * zoom,
        height: originalSize.h * zoom,
        maxWidth: 'none' as const,
        maxHeight: 'none' as const,
      }
    : undefined;

  // Аннотация под курсором — синхронизируется из ReadOnlyController через ref,
  // чтобы обработчик contextmenu мог её прочитать синхронно.
  const hoveredRef = useRef<ImageAnnotation | null>(null);
  const handleHoverChange = useCallback((ann: ImageAnnotation | null) => {
    hoveredRef.current = ann;
  }, []);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // ПКМ — предотвращаем браузерное меню, показываем своё
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const annotation = hoveredRef.current;
    if (!annotation) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, annotation });
  }, []);

  // ЛКМ — приходит из ReadOnlyController через useSelection
  const handleAnnotationSelect = useCallback((annotation: ImageAnnotation, x: number, y: number) => {
    setContextMenu({ x, y, annotation });
  }, []);

  const tagStyler = buildTagStyler(tags);

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
            <TagContextMenuPortal
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
