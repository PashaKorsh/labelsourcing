import { Annotorious, ImageAnnotator } from '@annotorious/react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import type { Tag } from '@/types/annotation';
import { useCanvasBase } from './useCanvasBase';
import { buildTagStyler } from './buildTagStyler';
import { AnnotatorController } from './AnnotatorController';
import '@annotorious/react/annotorious-react.css';
import styles from './AnnotationCanvas.module.css';

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
  } = useCanvasBase(imageUrl, activeTool === 'cursor', onImageSizeChange);

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
