import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Почему здесь нет CSS scale() ────────────────────────────────────────────
//
// Annotorious вычисляет координаты аннотаций через `event.offsetX/offsetY`.
// Браузер вычисляет offsetX в собственном CSS-пространстве целевого элемента,
// игнорируя CSS scale() у предков. Из-за этого при scale(2) на родителе:
//   offsetX = 300  (половина CSS-ширины 600px)
//   svgBCR.x = 200 (визуальная позиция с учётом scale)
//   s.x = offsetX + svgBCR.x = 500  ← неверно, нужно clientX = 800
//
// Решение: масштабировать сам <img> (offsetWidth/offsetHeight меняются →
// Annotorious получает корректные размеры через ResizeObserver).
// Пан — только через translate(), который offsetX не затрагивает.
// ─────────────────────────────────────────────────────────────────────────────

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 20;
const ZOOM_STEP = 1.12;

export interface ZoomPanState {
  zoom: number;
  panX: number;
  panY: number;
}

// panX/panY отсчитываются от ЦЕНТРА wrapper'а (где находится изображение
// при zoom=1, pan=0 благодаря flexbox-центрированию). При zoom-к-курсору
// это гарантирует, что точка под курсором остаётся на месте.
export function useZoomPan(wrapperRef: React.RefObject<HTMLDivElement | null>) {
  const [state, setState] = useState<ZoomPanState>({ zoom: 1, panX: 0, panY: 0 });
  // Ref нужен, чтобы обработчики событий всегда видели актуальное состояние
  // без перерегистрации при каждом рендере.
  const stateRef = useRef(state);

  const apply = useCallback((next: ZoomPanState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Зум колесом мыши к курсору
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Позиция курсора относительно центра wrapper'а
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      const { zoom, panX, panY } = stateRef.current;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
      const r = nextZoom / zoom;
      // Формула: точка под курсором не смещается при изменении зума
      apply({ zoom: nextZoom, panX: mx - r * (mx - panX), panY: my - r * (my - panY) });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wrapperRef, apply]);

  // Пан средней кнопкой мыши
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    type DragStart = { x: number; y: number; panX: number; panY: number };
    let drag: DragStart | null = null;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault(); // отключить автоскролл браузера
      drag = { x: e.clientX, y: e.clientY, panX: stateRef.current.panX, panY: stateRef.current.panY };
    };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      apply({
        ...stateRef.current,
        panX: drag.panX + (e.clientX - drag.x),
        panY: drag.panY + (e.clientY - drag.y),
      });
    };
    const onUp = (e: MouseEvent) => { if (e.button === 1) drag = null; };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [wrapperRef, apply]);

  const reset = useCallback(() => apply({ zoom: 1, panX: 0, panY: 0 }), [apply]);

  return { ...state, reset };
}
