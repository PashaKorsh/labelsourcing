/**
 * Generic drawing tool definition.
 * Used by the tool registry and sidebar UI.
 * Each annotation library maps its own tool names to these IDs.
 */
export interface DrawingToolDef {
  id: string;
  label: string;
  icon: string;
}
