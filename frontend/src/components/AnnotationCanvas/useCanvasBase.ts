import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { ImageAnnotation } from '@annotorious/annotorious';
import type { ContextMenuState } from './types';
import { useZoomPan } from './useZoomPan';

export function useCanvasBase(
  imageUrl: string,
  leftButtonPan: boolean,
  onImageSizeChange?: (size: { w: number; h: number }) => void,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const leftButtonPanRef = useRef(leftButtonPan);
  useEffect(() => { leftButtonPanRef.current = leftButtonPan; }, [leftButtonPan]);
  const { zoom, panX, panY, reset } = useZoomPan(wrapperRef, leftButtonPanRef);

  const [originalSize, setOriginalSize] = useState<{ w: number; h: number } | null>(null);

  // Измеряем натуральный размер через отдельный Image-объект — независимо от того,
  // как Annotorious обращается с <img> внутри ImageAnnotator (клонирует, оборачивает и т.д.).
  // Браузер отдаёт уже закэшированный ресурс, поэтому дублирующего запроса на сеть нет.
  useEffect(() => {
    setOriginalSize(null);
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      const nw = probe.naturalWidth;
      const nh = probe.naturalHeight;
      if (!nw || !nh) return;
      const scale = Math.min(1, (window.innerWidth * 0.8) / nw, (window.innerHeight * 0.8) / nh);
      setOriginalSize({ w: Math.round(nw * scale), h: Math.round(nh * scale) });
      onImageSizeChange?.({ w: nw, h: nh });
    };
    probe.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl, onImageSizeChange]);

  // Явные размеры передаются на <img>, чтобы Annotorious увидел изменение
  // через свой ResizeObserver и пересчитал SVG-оверлей корректно.
  const displayStyle = originalSize
    ? {
        width: originalSize.w * zoom,
        height: originalSize.h * zoom,
        maxWidth: 'none' as const,
        maxHeight: 'none' as const,
      }
    : undefined;

  // Аннотация под курсором — синхронизируется через ref для синхронного доступа
  // в обработчике contextmenu без лишних ре-рендеров.
  const hoveredRef = useRef<ImageAnnotation | null>(null);
  const handleHoverChange = useCallback((ann: ImageAnnotation | null) => {
    hoveredRef.current = ann;
  }, []);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const handleContextMenu = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const annotation = hoveredRef.current;
    if (!annotation) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, annotation });
  }, []);

  return {
    wrapperRef,
    zoom,
    panX,
    panY,
    reset,
    originalSize,
    displayStyle,
    hoveredRef,
    handleHoverChange,
    contextMenu,
    setContextMenu,
    handleContextMenu,
  };
}
