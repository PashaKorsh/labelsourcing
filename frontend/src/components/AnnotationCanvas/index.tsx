import { useCallback, useEffect, useRef, useState } from 'react';
import { Annotorious, ImageAnnotator } from '@annotorious/react';
import type { ImageAnnotation, DrawingStyle } from '@annotorious/annotorious';
import type { Tag } from '../../types/annotation';
import { useZoomPan } from './useZoomPan';
import { AnnotatorController } from './AnnotatorController';
import type { ContextMenuState } from './types';
import '@annotorious/react/annotorious-react.css';
import styles from './AnnotationCanvas.module.css';

// Строит функцию стилизации аннотаций по цвету тега
function buildTagStyler(tags: Tag[]) {
  return (annotation: ImageAnnotation): DrawingStyle | undefined => {
    const body = annotation.bodies.find(b => b.purpose === 'classifying');
    const tag = tags.find(t => t.id === body?.value);
    if (!tag) return undefined;
    const color = tag.color as DrawingStyle['fill'];
    return { fill: color, fillOpacity: 0.2, stroke: color, strokeWidth: 2 };
  };
}

export interface AnnotationCanvasProps {
  imageUrl: string;
  activeTool: string;
  activeTag: Tag | null;
  tags: Tag[];
  initialAnnotations: ImageAnnotation[];
  onAnnotationsChange: (annotations: ImageAnnotation[]) => void;
  onImageSizeChange?: (size: { w: number; h: number }) => void;
  onNext?: () => void;
}

export function AnnotationCanvas({
  imageUrl,
  activeTool,
  activeTag,
  tags,
  initialAnnotations,
  onAnnotationsChange,
  onImageSizeChange,
  onNext,
}: AnnotationCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const leftButtonPanRef = useRef(activeTool === 'cursor');
  useEffect(() => { leftButtonPanRef.current = activeTool === 'cursor'; }, [activeTool]);
  const { zoom, panX, panY, reset } = useZoomPan(wrapperRef, leftButtonPanRef);

  const [originalSize, setOriginalSize] = useState<{ w: number; h: number } | null>(null);

  // Измеряем натуральный размер через отдельный Image-объект — независимо от того,
  // как Annotorious обращается с <img> внутри ImageAnnotator (клонирует, оборачивает и т.д.).
  // Браузер отдаёт уже закэшированный ресурс, поэтому дублирующего запроса на сеть нет.
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
      onImageSizeChange?.({ w: nw, h: nh });
    };
    probe.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl, onImageSizeChange]);

  // Явные размеры передаются на <img>, чтобы Annotorious увидел изменение
  // через свой ResizeObserver и пересчитал SVG-оверлей корректно.
  const displayStyle = originalSize
    ? {
        width: originalSize.w * zoom,
        height: originalSize.h * zoom,
        maxWidth: 'none' as const,
        maxHeight: 'none' as const,
      }
    : undefined;

  // Аннотация под курсором — синхронизируется из AnnotatorController через ref,
  // чтобы обработчик contextmenu мог её прочитать синхронно.
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
      style={activeTool === 'cursor' ? { cursor: 'grab' } : undefined}
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
          <ImageAnnotator style={tagStyler} containerClassName={styles.annotoriousContainer}>
            <img
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
            tags={tags}
            initialAnnotations={initialAnnotations}
            sizeReady={originalSize !== null}
            onAnnotationsChange={onAnnotationsChange}
            onHoverChange={handleHoverChange}
            contextMenu={contextMenu}
            onContextMenuClose={() => setContextMenu(null)}
            onNext={onNext}
          />
        </Annotorious>
      </div>
    </div>
  );
}
