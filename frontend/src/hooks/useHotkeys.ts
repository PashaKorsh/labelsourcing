import { useEffect, useRef } from 'react';

// Формат ключа: одна клавиша или комбинация через '+', регистр не важен.
// Примеры: 'r', 'p', 'delete', 'ctrl+z', 'ctrl+shift+z'
export type HotkeyMap = Record<string, () => void>;

function eventToHotkey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (e.metaKey) parts.push('meta');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

// Регистрирует глобальные горячие клавиши на время жизни компонента.
// map можно передавать новый на каждый рендер — внутри используется ref,
// поэтому слушатель перерегистрируется только при монтировании.
export function useHotkeys(map: HotkeyMap): void {
  const mapRef = useRef(map);
  useEffect(() => { mapRef.current = map; });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      const action = mapRef.current[eventToHotkey(e)];
      if (action) {
        e.preventDefault();
        action();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
