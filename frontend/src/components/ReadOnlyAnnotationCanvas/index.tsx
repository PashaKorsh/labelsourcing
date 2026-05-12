import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Annotorious, ImageAnnotator, useAnnotator } from '@annotorious/react';
import type { ImageAnnotation, DrawingStyle } from '@annotorious/annotorious';
import type { ImageAnnotator as ImageAnnotatorInstance } from '@annotorious/annotorious';
import type { Tag } from '../../types/annotation';
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

// Живёт внутри <Annotorious>. Устанавливает аннотации однократно, но только после
// того, как displayStyle применился к img (sizeReady=true). Это устраняет race condition,
// при котором anno инициализируется до применения правильного масштаба изображения.
function ReadOnlyController({
  initialAnnotations,
  sizeReady,
}: {
  initialAnnotations: ImageAnnotation[];
  sizeReady: boolean;
}) {
  const anno = useAnnotator<ImageAnnotatorInstance>();

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
  const imgRef = useRef<HTMLImageElement>(null);
  const panRef = useRef(true);
  const { zoom, panX, panY, reset } = useZoomPan(wrapperRef, panRef);

  const [originalSize, setOriginalSize] = useState<{ w: number; h: number } | null>(null);

  const measureImage = useCallback((img: HTMLImageElement) => {
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const scale = Math.min(1, (window.innerWidth * 0.8) / nw, (window.innerHeight * 0.8) / nh);
    setOriginalSize({ w: Math.round(nw * scale), h: Math.round(nh * scale) });
  }, []);

  // При смене URL сбрасываем размер и сразу проверяем кэшированные изображения
  useEffect(() => {
    setOriginalSize(null);
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) measureImage(img);
  }, [imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    measureImage(e.currentTarget);
  }, [measureImage]);

  const displayStyle = originalSize
    ? {
        width: originalSize.w * zoom,
        height: originalSize.h * zoom,
        maxWidth: 'none' as const,
        maxHeight: 'none' as const,
      }
    : undefined;

  const tagStyler = buildTagStyler(tags);

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      style={{ cursor: 'grab' }}
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
            containerClassName={styles.annotoriousContainer}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              className={styles.image}
              style={displayStyle}
              alt="Annotation target"
              draggable={false}
              crossOrigin="anonymous"
              onLoad={handleImageLoad}
            />
          </ImageAnnotator>
          <ReadOnlyController
            initialAnnotations={initialAnnotations}
            sizeReady={originalSize !== null}
          />
        </Annotorious>
      </div>
    </div>
  );
}
