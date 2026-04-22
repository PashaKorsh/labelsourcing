// Описание инструмента рисования. id должен совпадать с именем инструмента в библиотеке разметки.
export interface DrawingToolDef {
  id: string;
  label: string;
  icon: string;
  hotkey?: string; // необязательная горячая клавиша, например 'r' или 'ctrl+r'
}
