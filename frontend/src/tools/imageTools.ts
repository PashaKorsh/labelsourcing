import type { DrawingToolDef } from '../types/tools';

/**
 * Drawing tools available for image annotation.
 * The `id` must match the tool name expected by Annotorious.
 */
export const IMAGE_DRAWING_TOOLS: DrawingToolDef[] = [
  { id: 'rectangle', label: 'Rectangle', icon: '▭' },
  { id: 'polygon', label: 'Polygon', icon: '⬡' },
];
