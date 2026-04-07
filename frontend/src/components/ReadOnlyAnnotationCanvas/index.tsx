import { useEffect, useRef, useState } from 'react';
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

// Живёт внутри <Annotorious>. Загружает аннотации и отключает рисование.
function ReadOnlyController({ annotations }: { annotations: ImageAnnotation[] }) {
  const anno = useAnnotator<ImageAnnotatorInstance>();

  useEffect(() => {
    if (!anno) return;
    anno.setDrawingEnabled(false);
  }, [anno]);

  // Перезагружаем аннотации когда anno инициализирован или изменился набор аннотаций
  useEffect(() => {
    if (!anno) return;
    anno.setAnnotations(annotations);
  }, [anno, annotations]);

  return null;
}

export interface ReadOnlyAnnotationCanvasProps {
  imageUrl: string;
  annotations: ImageAnnotation[];
  tags: Tag[];
  onImageSizeChange?: (size: { w: number; h: number }) => void;
}

export function ReadOnlyAnnotationCanvas({
  imageUrl,
  annotations,
  tags,
  onImageSizeChange,
}: ReadOnlyAnnotationCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // В режиме просмотра всегда паним левой кнопкой
  const panRef = useRef(true);
  const { zoom, panX, panY, reset } = useZoomPan(wrapperRef, panRef);

  const [originalSize, setOriginalSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    setOriginalSize(null);

    const measure = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (nw === 0 || nh === 0) return;
      const scale = Math.min(1, (window.innerWidth * 0.8) / nw, (window.innerHeight * 0.8) / nh);
      setOriginalSize({ w: Math.round(nw * scale), h: Math.round(nh * scale) });
      onImageSizeChange?.({ w: nw, h: nh });
      obs.disconnect();
    };

    const obs = new ResizeObserver(measure);
    obs.observe(img);
    img.addEventListener('load', measure);
    measure();

    return () => {
      obs.disconnect();
      img.removeEventListener('load', measure);
    };
  }, [imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps

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
            />
          </ImageAnnotator>
          <ReadOnlyController annotations={annotations} />
        </Annotorious>
      </div>
    </div>
  );
}
