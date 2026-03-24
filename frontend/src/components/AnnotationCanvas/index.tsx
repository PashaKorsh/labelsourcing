import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Annotorious,
  ImageAnnotator,
  useAnnotator,
  useAnnotations,
  useHover,
  useSelection,
} from '@annotorious/react';
import type { ImageAnnotator as ImageAnnotatorInstance } from '@annotorious/annotorious';
import type { ImageAnnotation, AnnotationBody, DrawingStyle } from '@annotorious/annotorious';
import type { Tag } from '../../types/annotation';
import '@annotorious/react/annotorious-react.css';
import styles from './AnnotationCanvas.module.css';

// ─── Zoom / Pan ───────────────────────────────────────────────────────────────
//
// IMPORTANT — why we don't use CSS `scale()` on a parent:
//
// Annotorious maps pointer events to image coordinates using `event.offsetX`
// (which is in the target element's OWN CSS-pixel space, ignoring CSS scale on
// ancestors) combined with the SVG's `getScreenCTM()`. When a parent is CSS-
// scaled, `offsetX` is divided by the scale factor while `getBCR()` is not,
// so `s.x = offsetX + svgBCR.x` is wrong — causing cursor drift proportional
// to the zoom level.
//
// Fix: resize the <img> element directly (so Annotorious's ResizeObserver fires
// and updates the SVG overlay). Pan is implemented with translate() only
// (no scale), which does not affect `offsetX`.
// ─────────────────────────────────────────────────────────────────────────────

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 20;
const ZOOM_STEP = 1.12;

interface Transform { zoom: number; panX: number; panY: number }

/**
 * Wheel-zoom toward cursor + middle-mouse drag to pan.
 *
 * Coordinate system: panX / panY are relative to the WRAPPER CENTER (the
 * natural center of the image at zoom=1, pan=0). This matches the centering
 * done by flexbox in `.centeringContainer`.
 */
function useZoomPan(wrapperRef: React.RefObject<HTMLDivElement | null>) {
  const [transform, setTransform] = useState<Transform>({ zoom: 1, panX: 0, panY: 0 });
  const tRef = useRef<Transform>(transform);

  const apply = useCallback((next: Transform) => {
    tRef.current = next;
    setTransform(next);
  }, []);

  // Wheel zoom toward cursor
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Mouse position relative to WRAPPER CENTER (image's resting position).
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      const { zoom, panX, panY } = tRef.current;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
      const r = nextZoom / zoom;
      apply({ zoom: nextZoom, panX: mx - r * (mx - panX), panY: my - r * (my - panY) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wrapperRef, apply]);

  // Middle-mouse drag to pan
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    type Drag = { x: number; y: number; panX: number; panY: number };
    let drag: Drag | null = null;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      drag = { x: e.clientX, y: e.clientY, panX: tRef.current.panX, panY: tRef.current.panY };
    };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      apply({ ...tRef.current, panX: drag.panX + (e.clientX - drag.x), panY: drag.panY + (e.clientY - drag.y) });
    };
    const onUp = (e: MouseEvent) => { if (e.button === 1) drag = null; };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [wrapperRef, apply]);

  const reset = useCallback(() => apply({ zoom: 1, panX: 0, panY: 0 }), [apply]);
  return { ...transform, reset };
}

// ─── Tag color styler ─────────────────────────────────────────────────────────

function buildTagStyler(tags: Tag[]) {
  return (annotation: ImageAnnotation): DrawingStyle | undefined => {
    const body = annotation.bodies.find(b => b.purpose === 'classifying');
    const tag = tags.find(t => t.id === body?.value);
    if (!tag) return undefined;
    const color = tag.color as DrawingStyle['fill'];
    return { fill: color, fillOpacity: 0.2, stroke: color, strokeWidth: 2 };
  };
}

// ─── Context menu ─────────────────────────────────────────────────────────────

interface ContextMenuState { x: number; y: number; annotation: ImageAnnotation }

function ContextMenuPortal({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const anno = useAnnotator<ImageAnnotatorInstance>();
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);
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
        Delete
      </button>
    </div>,
    document.body,
  );
}

// ─── Controller ───────────────────────────────────────────────────────────────

interface ControllerProps {
  activeTool: string;
  activeTag: Tag | null;
  initialAnnotations: ImageAnnotation[];
  onAnnotationsChange: (annotations: ImageAnnotation[]) => void;
  onHoverChange: (annotation: ImageAnnotation | null) => void;
  contextMenu: ContextMenuState | null;
  onContextMenuClose: () => void;
}

function AnnotatorController({
  activeTool, activeTag, initialAnnotations, onAnnotationsChange,
  onHoverChange, contextMenu, onContextMenuClose,
}: ControllerProps) {
  const anno = useAnnotator<ImageAnnotatorInstance>();
  const activeTagRef = useRef(activeTag);
  const onChangeRef = useRef(onAnnotationsChange);
  const onHoverRef = useRef(onHoverChange);
  useEffect(() => { activeTagRef.current = activeTag; }, [activeTag]);
  useEffect(() => { onChangeRef.current = onAnnotationsChange; }, [onAnnotationsChange]);
  useEffect(() => { onHoverRef.current = onHoverChange; }, [onHoverChange]);

  const hovered = useHover<ImageAnnotation>();
  useEffect(() => { onHoverRef.current(hovered ?? null); }, [hovered]);

  const selection = useSelection<ImageAnnotation>();
  const selectionRef = useRef(selection);
  useEffect(() => { selectionRef.current = selection; }, [selection]);

  // Switch drawing tool
  useEffect(() => {
    if (!anno) return;
    anno.setDrawingTool(activeTool);
  }, [anno, activeTool]);

  // Restore saved annotations on mount
  useEffect(() => {
    if (!anno || initialAnnotations.length === 0) return;
    anno.setAnnotations(initialAnnotations);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno]);

  // Attach active tag to newly drawn annotations
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

  // Report annotation changes to parent
  const annotations = useAnnotations<ImageAnnotation>();
  useEffect(() => { onChangeRef.current(annotations); }, [annotations]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!anno) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        selectionRef.current.selected.forEach(({ annotation }) => anno.removeAnnotation(annotation));
        return;
      }
      // Ctrl+Z any layout (use event.code — physical key, layout-independent)
      if (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey && e.key !== 'z' && e.key !== 'Z') {
        e.preventDefault(); anno.undo(); return;
      }
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

// ─── Public component ─────────────────────────────────────────────────────────

interface Props {
  imageUrl: string;
  activeTool: string;
  activeTag: Tag | null;
  tags: Tag[];
  initialAnnotations: ImageAnnotation[];
  onAnnotationsChange: (annotations: ImageAnnotation[]) => void;
}

export function AnnotationCanvas({
  imageUrl, activeTool, activeTag, tags, initialAnnotations, onAnnotationsChange,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const { zoom, panX, panY, reset } = useZoomPan(wrapperRef);

  // Record the image's constrained display size at zoom=1.
  // We use ResizeObserver so it fires after the image actually renders.
  const [originalSize, setOriginalSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    setOriginalSize(null); // reset on image URL change
    const obs = new ResizeObserver(() => {
      if (!originalSize && img.naturalWidth > 0) {
        setOriginalSize({ w: img.offsetWidth, h: img.offsetHeight });
        obs.disconnect();
      }
    });
    obs.observe(img);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]); // re-run when image URL changes

  // Explicit display dimensions — set on <img> so Annotorious's ResizeObserver
  // detects the change and recalculates its SVG overlay correctly.
  const displayStyle = originalSize
    ? { width: originalSize.w * zoom, height: originalSize.h * zoom, maxWidth: 'none' as const, maxHeight: 'none' as const }
    : undefined;

  // Context menu: hovered annotation from inside Annotorious, shown from outside.
  const hoveredRef = useRef<ImageAnnotation | null>(null);
  const handleHoverChange = useCallback((ann: ImageAnnotation | null) => {
    hoveredRef.current = ann;
  }, []);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const annotation = hoveredRef.current;
    if (!annotation) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, annotation });
  }, []);

  const tagStyler = buildTagStyler(tags);

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      onContextMenu={handleContextMenu}
    >
      {/* Zoom indicator */}
      <div className={styles.zoomIndicator}>
        <span>{Math.round(zoom * 100)}%</span>
        {zoom !== 1 && (
          <button className={styles.zoomReset} onClick={reset} title="Reset zoom">⊙</button>
        )}
      </div>

      {/*
        Pan via CSS translate ONLY — no CSS scale.
        The centering container uses flexbox to place the image at the
        wrapper's center. translate(panX, panY) then shifts it from that center.

        CSS translate() does NOT affect event.offsetX (unlike scale()), so
        Annotorious receives correct pointer coordinates at all zoom levels.
      */}
      <div
        className={styles.centeringContainer}
        style={{ transform: `translate(${panX}px, ${panY}px)` }}
      >
        <Annotorious>
          <ImageAnnotator style={tagStyler} containerClassName={styles.annotoriousContainer}>
            <img
              ref={imgRef}
              src={imageUrl}
              className={styles.image}
              style={displayStyle}
              alt="Annotation target"
              draggable={false}
              crossOrigin="anonymous"
            />
          </ImageAnnotator>
          <AnnotatorController
            activeTool={activeTool}
            activeTag={activeTag}
            initialAnnotations={initialAnnotations}
            onAnnotationsChange={onAnnotationsChange}
            onHoverChange={handleHoverChange}
            contextMenu={contextMenu}
            onContextMenuClose={() => setContextMenu(null)}
          />
        </Annotorious>
      </div>
    </div>
  );
}
