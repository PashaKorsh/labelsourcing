import type { ImageAnnotation } from '@annotorious/annotorious';
import type { SerializedShape } from './annotationSerializer';

// imageW/imageH — натуральные размеры для денормализации координат из [0, 1] в пиксели
export function deserializeAnnotations(
  shapes: SerializedShape[],
  imageW: number,
  imageH: number,
): ImageAnnotation[] {
  return shapes.map(shape => {
    const id = crypto.randomUUID();
    const bodies = shape.tag
      ? [{ id: crypto.randomUUID(), annotation: id, purpose: 'classifying' as const, value: shape.tag }]
      : [];

    if (shape.shape === 'rectangle') {
      const x = shape.left * imageW;
      const y = shape.top * imageH;
      const w = shape.width * imageW;
      const h = shape.height * imageH;

      return {
        id,
        target: {
          annotation: id,
          selector: {
            type: 'RECTANGLE',
            geometry: {
              x, y, w, h,
              bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
            },
          },
        },
        bodies,
      } as unknown as ImageAnnotation;
    } else {
      const points = shape.points.map(p => [p.left * imageW, p.top * imageH]);
      const xs = points.map(p => p[0]);
      const ys = points.map(p => p[1]);

      return {
        id,
        target: {
          annotation: id,
          selector: {
            type: 'POLYGON',
            geometry: {
              points,
              bounds: {
                minX: Math.min(...xs),
                minY: Math.min(...ys),
                maxX: Math.max(...xs),
                maxY: Math.max(...ys),
              },
            },
          },
        },
        bodies,
      } as unknown as ImageAnnotation;
    }
  });
}
