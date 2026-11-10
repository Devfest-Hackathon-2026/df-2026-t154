import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
/** Ctrl+ホイール・トラックパッドのピンチの感度。 */
const WHEEL_SENSITIVITY = 0.01;

export function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

type Anchor = { x: number; y: number; clientX: number; clientY: number };
type GestureLike = Event & { scale: number; clientX: number; clientY: number };

/**
 * フローチャートだけを拡大縮小する。CSSのzoomを使い、ブラウザのページ全体の拡大はチャート上で止める。
 * スマホ：2本指のピンチ。PC：Ctrl+ホイール、トラックパッドのピンチ（Safariはgestureイベント）。
 * 拡大縮小の中心（指やカーソルの位置）が動かないようにスクロール位置を補正する。
 */
export function useChartZoom(scroll: RefObject<HTMLElement | null>, grid: RefObject<HTMLElement | null>) {
  const [zoom, setZoom] = useState(1);
  const current = useRef(1);
  const anchor = useRef<Anchor | null>(null);

  const zoomTo = useCallback((value: number, clientX?: number, clientY?: number) => {
    const next = clampZoom(value);
    const from = current.current;
    if (next === from) return;
    const gridElement = grid.current, scrollElement = scroll.current;
    if (gridElement && scrollElement) {
      const view = scrollElement.getBoundingClientRect();
      const x = clientX ?? view.left + view.width / 2, y = clientY ?? view.top + view.height / 2;
      const rect = gridElement.getBoundingClientRect();
      anchor.current = { x: (x - rect.left) / from, y: (y - rect.top) / from, clientX: x, clientY: y };
    }
    current.current = next;
    setZoom(next);
  }, [grid, scroll]);

  // 描画後に、中心だった点が同じ画面位置に残るようスクロールする。
  useLayoutEffect(() => {
    const point = anchor.current, element = scroll.current;
    anchor.current = null;
    const content = grid.current;
    if (!point || !element || !content) return;
    // 中央寄せの余白も倍率によって変わるので、描画後のグリッド位置を基準に補正する。
    const rect = content.getBoundingClientRect();
    element.scrollLeft += rect.left + point.x * zoom - point.clientX;
    element.scrollTop += rect.top + point.y * zoom - point.clientY;
  }, [zoom, scroll, grid]);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    let pinch: { distance: number; zoom: number } | null = null;
    let gesture: number | null = null;
    const distance = (touches: TouchList) => Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);
    const middle = (touches: TouchList) => [(touches[0]!.clientX + touches[1]!.clientX) / 2, (touches[0]!.clientY + touches[1]!.clientY) / 2] as const;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) pinch = { distance: distance(event.touches), zoom: current.current };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinch) return;
      event.preventDefault();
      const [x, y] = middle(event.touches);
      zoomTo(pinch.zoom * distance(event.touches) / pinch.distance, x, y);
    };
    const onTouchEnd = (event: TouchEvent) => { if (event.touches.length < 2) pinch = null; };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return; // 通常のホイールはスクロールのまま
      event.preventDefault();
      zoomTo(current.current * Math.exp(-event.deltaY * WHEEL_SENSITIVITY), event.clientX, event.clientY);
    };
    // Safari（macOSのトラックパッド、iOS）のピンチ。iOSではタッチ側で処理するので、ページ拡大を止めるだけにする。
    const onGestureStart = (event: Event) => { event.preventDefault(); gesture = current.current; };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      if (pinch || gesture === null) return;
      const { scale, clientX, clientY } = event as GestureLike;
      zoomTo(gesture * scale, clientX, clientY);
    };
    const onGestureEnd = (event: Event) => { event.preventDefault(); gesture = null; };

    const active = { passive: false } as const;
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, active);
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    element.addEventListener('wheel', onWheel, active);
    element.addEventListener('gesturestart', onGestureStart, active);
    element.addEventListener('gesturechange', onGestureChange, active);
    element.addEventListener('gestureend', onGestureEnd, active);
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', onGestureStart);
      element.removeEventListener('gesturechange', onGestureChange);
      element.removeEventListener('gestureend', onGestureEnd);
    };
  }, [scroll, zoomTo]);

  return {
    zoom,
    zoomIn: () => zoomTo(current.current + ZOOM_STEP),
    zoomOut: () => zoomTo(current.current - ZOOM_STEP),
    reset: () => zoomTo(1),
  };
}
