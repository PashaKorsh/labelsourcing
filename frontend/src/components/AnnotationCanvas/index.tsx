import { useEffect, useRef } from 'react';
import {
  Annotorious,
  ImageAnnotator,
  useAnnotator,
  useAnnotations,
} from '@annotorious/react';
import type { ImageAnnotator as ImageAnnotatorInstance } from '@annotorious/annotorious';
import type {
  ImageAnnotation,
  AnnotationBody,
  DrawingStyle,
} from '@annotorious/annotorious';
import type { Tag } from '../../types/annotation';
import '@annotorious/react/annotorious-react.css';
import styles from './AnnotationCanvas.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTagStyler(tags: Tag[]) {
  return (annotation: ImageAnnotation): DrawingStyle | undefined => {
    const body = annotation.bodies.find(b => b.purpose === 'classifying');
    const tag = tags.find(t => t.id === body?.value);
    if (!tag) return undefined;
    // Color type is RGB|RGBA|HEX; our hex strings satisfy HEX = `#${string}`
    const color = tag.color as DrawingStyle['fill'];
    return { fill: color, fillOpacity: 0.2, stroke: color, strokeWidth: 2 };
  };
}

// ─── Controller (must live inside <Annotorious>) ──────────────────────────────

interface ControllerProps {
  activeTool: string;
  activeTag: Tag | null;
  initialAnnotations: ImageAnnotation[];
  onAnnotationsChange: (annotations: ImageAnnotation[]) => void;
}

function AnnotatorController({
  activeTool,
  activeTag,
  initialAnnotations,
  onAnnotationsChange,
}: ControllerProps) {
  const anno = useAnnotator<ImageAnnotatorInstance>();

  // Keep mutable refs so event handlers are never stale without re-subscribing.
  const activeTagRef = useRef(activeTag);
  const onChangeRef = useRef(onAnnotationsChange);
  useEffect(() => { activeTagRef.current = activeTag; }, [activeTag]);
  useEffect(() => { onChangeRef.current = onAnnotationsChange; }, [onAnnotationsChange]);

  // Switch drawing tool.
  useEffect(() => {
    if (!anno) return;
    anno.setDrawingTool(activeTool);
  }, [anno, activeTool]);

  // Load saved annotations on mount (runs once when anno becomes available).
  useEffect(() => {
    if (!anno) return;
    if (initialAnnotations.length > 0) {
      anno.setAnnotations(initialAnnotations);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anno]); // intentionally omit initialAnnotations — load once on mount only

  // Attach the active tag to each newly drawn annotation.
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

  // Report the current annotation set to the parent after every change.
  // useAnnotations() is reactive and always reflects the latest store state,
  // so we never miss an update (create / update / delete).
  const annotations = useAnnotations<ImageAnnotation>();
  useEffect(() => {
    onChangeRef.current(annotations);
  }, [annotations]);

  return null;
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
  imageUrl,
  activeTool,
  activeTag,
  tags,
  initialAnnotations,
  onAnnotationsChange,
}: Props) {
  // Rebuild styler only when the tag list changes.
  const tagStyler = buildTagStyler(tags);

  return (
    <div className={styles.wrapper}>
      <Annotorious>
        <ImageAnnotator style={tagStyler}>
          <img
            src={imageUrl}
            className={styles.image}
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
        />
      </Annotorious>
    </div>
  );
}
