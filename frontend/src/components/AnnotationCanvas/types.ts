import type { ImageAnnotation } from '@annotorious/annotorious';

export interface ContextMenuState {
  x: number;
  y: number;
  annotation: ImageAnnotation;
}
