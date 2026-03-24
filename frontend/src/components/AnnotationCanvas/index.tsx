import { useEffect, useRef } from 'react';
import { Annotorious, ImageAnnotator, useAnnotator } from '@annotorious/react';
import type { ImageAnnotator as ImageAnnotatorInstance } from '@annotorious/annotorious';
import type { ImageAnnotation, AnnotationBody } from '@annotorious/annotorious';
import type { Tag } from '../../types/annotation';
import '@annotorious/react/annotorious-react.css';
import styles from './AnnotationCanvas.module.css';

// ─── Controller ──────────────────────────────────────────────────────────────
// Must live inside <Annotorious> to access the annotator via context.

interface ControllerProps {
  activeTool: string;
  activeTag: Tag | null;
}

function AnnotatorController({ activeTool, activeTag }: ControllerProps) {
  const anno = useAnnotator<ImageAnnotatorInstance>();

  // Keep activeTag in a ref so the createAnnotation handler always sees the
  // latest value without needing to re-register the listener.
  const activeTagRef = useRef(activeTag);
  useEffect(() => {
    activeTagRef.current = activeTag;
  }, [activeTag]);

  // Switch drawing tool whenever activeTool changes.
  useEffect(() => {
    if (!anno) return;
    anno.setDrawingTool(activeTool);
  }, [anno, activeTool]);

  // Attach the selected tag body to every newly created annotation.
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

      anno.updateAnnotation({
        ...annotation,
        bodies: [...annotation.bodies, body],
      });
    };

    anno.on('createAnnotation', handleCreate);
    return () => anno.off('createAnnotation', handleCreate);
  }, [anno]);

  return null;
}

// ─── Public component ────────────────────────────────────────────────────────

interface Props {
  imageUrl: string;
  activeTool: string;
  activeTag: Tag | null;
}

export function AnnotationCanvas({ imageUrl, activeTool, activeTag }: Props) {
  return (
    <div className={styles.wrapper}>
      <Annotorious>
        <ImageAnnotator>
          <img
            src={imageUrl}
            className={styles.image}
            alt="Annotation target"
            draggable={false}
            crossOrigin="anonymous"
          />
        </ImageAnnotator>
        <AnnotatorController activeTool={activeTool} activeTag={activeTag} />
      </Annotorious>
    </div>
  );
}
