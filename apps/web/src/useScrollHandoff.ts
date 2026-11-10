import { useEffect, type RefObject } from 'react';

/** 端に着いた一連のスクロールを止め、新しい操作とみなすまでの間隔（ミリ秒）。 */
const GESTURE_GAP_MS = 200;
/** 端で新しく操作したとき、ページへ渡し始めるまでの押し込み量（px）。これが「ひっかかり」。 */
const WHEEL_THRESHOLD = 80;
/** 端に着いてから、新しいスワイプを受け付けるまで必ず止める時間（ミリ秒）。 */
const EDGE_LOCK_MS = 250;
/** 直前より何倍以上強いスクロールを「新しいスワイプ」とみなすか。 */
const WHEEL_STRENGTHEN_RATIO = 1.3;
const TOUCH_THRESHOLD = 40;
/** 慣性：1ミリ秒ごとの減速率（1に近いほど長く流れる）、速さの上限（px/ms）、止める速さ（px/ms）。 */
const MOMENTUM_DECAY_PER_MS = 0.997;
const MOMENTUM_MAX_SPEED = 4;
const MOMENTUM_MIN_SPEED = 0.02;
/** 指を離す直前のどのくらいの動きから速さを測るか（ミリ秒）。 */
const VELOCITY_WINDOW_MS = 100;

/**
 * フローチャート枠を上下の端までスクロールしたら、ページ全体のスクロールへ引き継ぐ。
 * 端に着いた勢いのままでは引き継がず、端で改めて少し押し込んだときだけページを動かす。
 * 枠のCSSはoverscroll-behavior: containのままにし、ブラウザ標準の引き継ぎは使わない。
 */
export function useScrollHandoff(scroll: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const atTop = () => element.scrollTop <= 0;
    const atBottom = () => element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
    const atEdge = (towardBottom: boolean) => towardBottom ? atBottom() : atTop();

    // PC：ホイール・トラックパッド
    // トラックパッドは指を離した後もOSの慣性でイベントが途切れず届くため、間隔だけでは新しい操作を見分けられない。
    // 慣性は勢いが弱まり続け、新しいスワイプは勢いが強まることを使って見分ける。
    let armed = false, pushed = 0, last = -Infinity, previousSize = 0;
    let edgeSince: number | null = null;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return; // 拡大縮小・横スクロールは対象外
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const delta = event.deltaY * unit;
      const now = event.timeStamp, gap = now - last, size = Math.abs(delta);
      const strengthening = size > previousSize * WHEEL_STRENGTHEN_RATIO + 1;
      last = now;
      previousSize = size;
      if (delta === 0 || !atEdge(delta > 0)) { armed = false; pushed = 0; edgeSince = null; return; }
      edgeSince ??= now;
      if (!armed) {
        if (gap >= GESTURE_GAP_MS) armed = true; // 端で間を空けて操作し直した（マウスのホイールなど）
        else if (now - edgeSince >= EDGE_LOCK_MS && strengthening) armed = true; // 慣性が収まり、新しいスワイプで勢いが強まった
        else return; // 端に着いた勢い・慣性の続きはここで止める
        pushed = 0;
      }
      if (Math.sign(pushed) !== 0 && Math.sign(pushed) !== Math.sign(delta)) pushed = 0;
      pushed += delta;
      if (Math.abs(pushed) < WHEEL_THRESHOLD) return;
      window.scrollBy({ top: delta, behavior: 'instant' });
    };

    // スマホ：指を離した後の慣性。新しく触ったら止める。
    let frame = 0;
    const stopMomentum = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
    const startMomentum = (speed: number) => {
      stopMomentum();
      let velocity = Math.max(-MOMENTUM_MAX_SPEED, Math.min(MOMENTUM_MAX_SPEED, speed));
      let previous = performance.now();
      const step = (now: number) => {
        const elapsed = Math.min(now - previous, 50);
        previous = now;
        velocity *= Math.pow(MOMENTUM_DECAY_PER_MS, elapsed);
        const before = window.scrollY;
        window.scrollBy({ top: velocity * elapsed, behavior: 'instant' });
        // 遅くなった、またはページの端に着いて動かなくなったら終える
        if (Math.abs(velocity) < MOMENTUM_MIN_SPEED || window.scrollY === before) { frame = 0; return; }
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    // スマホ：1本指のスワイプ。端にいる状態で触り始めたときだけ引き継ぐ。
    let touch: { y: number; startedAtTop: boolean; startedAtBottom: boolean; passed: boolean } | null = null;
    let samples: { time: number; y: number }[] = [];
    const onTouchStart = (event: TouchEvent) => {
      stopMomentum();
      samples = [];
      touch = event.touches.length === 1
        ? { y: event.touches[0]!.clientY, startedAtTop: atTop(), startedAtBottom: atBottom(), passed: false }
        : null; // ピンチ中は対象外
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) { touch = null; return; }
      const y = event.touches[0]!.clientY;
      const towardBottom = y < touch.y; // 指を上へ動かすと下へスクロール
      const started = towardBottom ? touch.startedAtBottom : touch.startedAtTop;
      if (!started || !atEdge(towardBottom)) return;
      const delta = touch.y - y;
      if (!touch.passed) {
        if (Math.abs(delta) < TOUCH_THRESHOLD) return;
        touch.passed = true;
        touch.y = y; // ひっかかりの分はページへ渡さない
        return;
      }
      touch.y = y;
      window.scrollBy({ top: delta, behavior: 'instant' });
      samples.push({ time: event.timeStamp, y });
      samples = samples.filter((sample) => event.timeStamp - sample.time <= VELOCITY_WINDOW_MS);
    };
    const onTouchEnd = (event: TouchEvent) => {
      const passed = touch?.passed;
      touch = null;
      const first = samples[0], last = samples[samples.length - 1];
      samples = [];
      // 指を止めてから離した場合（最後の動きが古い）は慣性をつけない
      if (!passed || !first || !last || last.time === first.time || event.timeStamp - last.time > VELOCITY_WINDOW_MS) return;
      startMomentum((first.y - last.y) / (last.time - first.time));
    };
    // 枠の外を触ったときやホイール操作でも慣性を止める
    const stopOnOtherInput = () => stopMomentum();

    element.addEventListener('wheel', onWheel, { passive: true });
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('touchstart', stopOnOtherInput, { passive: true });
    window.addEventListener('wheel', stopOnOtherInput, { passive: true });
    return () => {
      stopMomentum();
      window.removeEventListener('touchstart', stopOnOtherInput);
      window.removeEventListener('wheel', stopOnOtherInput);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scroll]);
}
