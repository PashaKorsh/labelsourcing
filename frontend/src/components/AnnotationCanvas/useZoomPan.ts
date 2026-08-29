import { useCallback, useEffect, useRef, useState } from 'react';

// Масштабируем сам <img>, а не CSS scale() на родителе: Annotorious берёт координаты из
// event.offsetX/offsetY, а браузер считает offsetX в CSS-пространстве элемента, игнорируя
// scale() у предков — координаты уезжают. Меняем offsetWidth/offsetHeight <img> (Annotorious
// ловит их через ResizeObserver), а пан делаем через translate(), который offsetX не трогает.

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
export function useZoomPan(
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  leftButtonPanRef: React.RefObject<boolean>,
) {
  const [state, setState] = useState<ZoomPanState>({ zoom: 1, panX: 0, panY: 0 });
  const stateRef = useRef(state);

  const apply = useCallback((next: ZoomPanState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
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

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    type DragStart = { x: number; y: number; panX: number; panY: number };
    let drag: DragStart | null = null;

    const onDown = (e: MouseEvent) => {
      const isMiddle = e.button === 1;
      const isLeft = e.button === 0 && leftButtonPanRef.current;
      if (!isMiddle && !isLeft) return;
      e.preventDefault();
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
    const onUp = (e: MouseEvent) => {
      if (e.button === 0 || e.button === 1) drag = null;
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [wrapperRef, leftButtonPanRef, apply]);

  const reset = useCallback(() => apply({ zoom: 1, panX: 0, panY: 0 }), [apply]);

  return { ...state, reset };
}
