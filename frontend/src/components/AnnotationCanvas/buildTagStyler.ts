import type { ImageAnnotation, DrawingStyle } from '@annotorious/annotorious';
import type { Tag } from '@/types/annotation';

export function buildTagStyler(tags: Tag[], fillOpacity = 0.2) {
  return (annotation: ImageAnnotation): DrawingStyle | undefined => {
    const body = annotation.bodies.find(b => b.purpose === 'classifying');
    const tag = tags.find(t => t.id === body?.value);
    if (!tag) return undefined;
    const color = tag.color as DrawingStyle['fill'];
    return { fill: color, fillOpacity, stroke: color, strokeWidth: 2 };
  };
}
