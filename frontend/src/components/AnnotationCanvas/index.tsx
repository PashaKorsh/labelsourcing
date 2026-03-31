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
}

export function AnnotationCanvas({
  imageUrl,
  activeTool,
  activeTag,
  tags,
  initialAnnotations,
  onAnnotationsChange,
}: AnnotationCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const { zoom, panX, panY, reset } = useZoomPan(wrapperRef);

  // Исходный размер изображения при zoom=1 (с учётом CSS-ограничений max-width/height).
  // Фиксируется при загрузке, используется для вычисления displayStyle.
  // ResizeObserver вместо onLoad — надёжнее для изображений из кэша.
  const [originalSize, setOriginalSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    setOriginalSize(null);

    const measure = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (nw === 0 || nh === 0) return;
      // Вычисляем CSS-ограниченный размер (max-width: 80vw; max-height: 80vh) программно —
      // это безопасно в любой момент, не зависит от текущего layout/displayStyle.
      const scale = Math.min(1, (window.innerWidth * 0.8) / nw, (window.innerHeight * 0.8) / nh);
      setOriginalSize({ w: Math.round(nw * scale), h: Math.round(nh * scale) });
      obs.disconnect();
    };

    const obs = new ResizeObserver(measure);
    obs.observe(img);
    // load — гарантированный триггер для незакэшированных изображений
    img.addEventListener('load', measure);
    // Для кэшированных изображений naturalWidth уже доступен синхронно
    measure();

    return () => {
      obs.disconnect();
      img.removeEventListener('load', measure);
    };
  }, [imageUrl]);

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
      onContextMenu={handleContextMenu}
    >
      <div className={styles.zoomIndicator}>
        <span>{Math.round(zoom * 100)}%</span>
        {zoom !== 1 && (
          <button className={styles.zoomReset} onClick={reset} title="Сбросить зум">⊙</button>
        )}
      </div>

      {/*
        Только translate (не scale!) — центрирующий контейнер смещается
        от своего flex-центра на (panX, panY). CSS translate не влияет
        на event.offsetX, поэтому координаты Annotorious остаются верными.
        Масштабирование — через явный width/height на <img> (displayStyle).
      */}
      <div
        className={styles.scene}
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
