import type { DrawingToolDef } from '../types/tools';

// id должен совпадать с именем инструмента в Annotorious
export const IMAGE_DRAWING_TOOLS: DrawingToolDef[] = [
  { id: 'rectangle', label: 'Прямоугольник', icon: '▭', hotkey: 'r' },
  { id: 'polygon', label: 'Полигон', icon: '⬡', hotkey: 'p' },
];
