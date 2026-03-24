import { useState, useEffect } from 'react';
import { AnnotationCanvas } from '../../components/AnnotationCanvas';
import { ToolSelector } from '../../components/ToolSelector';
import { TagSelector } from '../../components/TagSelector';
import { IMAGE_DRAWING_TOOLS } from '../../tools/imageTools';
import { imageService } from '../../services/imageService';
import type { Tag } from '../../types/annotation';
import type { ImageSource } from '../../services/imageService';
import styles from './WorkspacePage.module.css';

// Hardcoded sample tags — will be fetched from an API in the future.
const SAMPLE_TAGS: Tag[] = [
  { id: 'person', label: 'Person', color: '#ef4444' },
  { id: 'vehicle', label: 'Vehicle', color: '#3b82f6' },
  { id: 'animal', label: 'Animal', color: '#22c55e' },
  { id: 'object', label: 'Object', color: '#f59e0b' },
];

export function WorkspacePage() {
  const [activeTool, setActiveTool] = useState(IMAGE_DRAWING_TOOLS[0].id);
  const [activeTagId, setActiveTagId] = useState<string | null>(SAMPLE_TAGS[0].id);
  const [image, setImage] = useState<ImageSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    imageService
      .getImage('1')
      .then(setImage)
      .catch(err => setError(String(err)));
  }, []);

  const activeTag = SAMPLE_TAGS.find(t => t.id === activeTagId) ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Label Sourcing</h1>
        {image?.name && <span className={styles.imageName}>{image.name}</span>}
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <ToolSelector
            tools={IMAGE_DRAWING_TOOLS}
            activeTool={activeTool}
            onSelect={setActiveTool}
          />
          <div className={styles.divider} />
          <TagSelector
            tags={SAMPLE_TAGS}
            activeTagId={activeTagId}
            onSelect={setActiveTagId}
          />
        </aside>

        <main className={styles.canvasArea}>
          {error ? (
            <div className={styles.status}>Failed to load image: {error}</div>
          ) : !image ? (
            <div className={styles.status}>Loading…</div>
          ) : (
            <AnnotationCanvas
              imageUrl={image.url}
              activeTool={activeTool}
              activeTag={activeTag}
            />
          )}
        </main>
      </div>
    </div>
  );
}
