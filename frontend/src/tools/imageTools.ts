import type { DrawingToolDef } from '../types/tools';

// id 'cursor' — не инструмент Annotorious, обрабатывается отдельно (режим пана).
// Остальные id должны совпадать с именем инструмента в Annotorious.
export const IMAGE_DRAWING_TOOLS: DrawingToolDef[] = [
  { id: 'cursor',    label: 'Курсор',        icon: '↖', hotkey: 'q' },
  { id: 'rectangle', label: 'Прямоугольник', icon: '▭', hotkey: 'w' },
  { id: 'polygon',   label: 'Полигон',       icon: '⬡', hotkey: 'e' },
];
