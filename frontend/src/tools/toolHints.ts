export interface HotkeyHint {
  key: string;
  description: string;
}

// Подсказки, общие для всех рисующих инструментов
const DRAWING_HINTS: HotkeyHint[] = [
  { key: 'A / Del', description: 'Удалить объект' },
  { key: 'Z',       description: 'Отмена' },
  { key: 'X',       description: 'Повтор' },
  { key: 'F',       description: 'След. задача' },
  { key: 'G',       description: 'Отправить' },
];

// Подсказки, специфичные для конкретного инструмента (по tool id)
const EXTRA_HINTS: Record<string, HotkeyHint[]> = {
  cursor: [
    { key: 'ЛКМ + drag', description: 'Переместить холст' },
    { key: 'Колесо',     description: 'Масштаб' },
    { key: 'G',          description: 'Отправить' },
  ],
  rectangle: [],
  polygon: [
    { key: 'S', description: 'Удалить вершину' },
  ],
};

export function getHints(toolId: string): HotkeyHint[] {
  const extra = EXTRA_HINTS[toolId] ?? [];
  if (toolId === 'cursor') return extra;
  return [...DRAWING_HINTS, ...extra];
}
