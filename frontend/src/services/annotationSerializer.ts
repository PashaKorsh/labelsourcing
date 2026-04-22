import type { ImageAnnotation } from '@annotorious/annotorious';

export interface SerializedPoint {
  left: number;
  top: number;
}

export type SerializedShape =
  | { shape: 'rectangle'; left: number; top: number; width: number; height: number; tag?: string }
  | { shape: 'polygon'; points: SerializedPoint[]; tag?: string };

export interface SerializedTaskResult {
  task_id: string;
  output_values: {
    result: SerializedShape[];
  };
}

// Конвертирует аннотации одной задачи в формат для отправки.
// imageW / imageH — натуральные размеры изображения (в пикселях),
// используются для нормализации координат в диапазон [0, 1].
export function serializeTaskAnnotations(
  taskId: string,
  annotations: ImageAnnotation[],
  imageW: number,
  imageH: number,
): SerializedTaskResult {
  const result: SerializedShape[] = [];

  for (const ann of annotations) {
    const selector = ann.target.selector as unknown as {
      type: string;
      geometry: Record<string, unknown>;
    };
    const tagBody = ann.bodies.find(b => b.purpose === 'classifying');
    const tag = tagBody?.value as string | undefined;

    if (selector.type === 'RECTANGLE') {
      const g = selector.geometry as { x: number; y: number; w: number; h: number };
      result.push({
        shape: 'rectangle',
        left:   g.x / imageW,
        top:    g.y / imageH,
        width:  g.w / imageW,
        height: g.h / imageH,
        ...(tag ? { tag } : {}),
      });
    } else if (selector.type === 'POLYGON') {
      const g = selector.geometry as { points: number[][] };
      result.push({
        shape: 'polygon',
        points: g.points.map(([x, y]) => ({ left: x / imageW, top: y / imageH })),
        ...(tag ? { tag } : {}),
      });
    }
  }

  return { task_id: taskId, output_values: { result } };
}
