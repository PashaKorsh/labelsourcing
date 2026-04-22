import type { ImageAnnotation } from '@annotorious/annotorious';

// Состояние контекстного меню: позиция и аннотация, на которой кликнули ПКМ
export interface ContextMenuState {
  x: number;
  y: number;
  annotation: ImageAnnotation;
}
