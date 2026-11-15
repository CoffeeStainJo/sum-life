import { useEffect, useRef, type RefObject } from 'react';

/** Finger travel before a touch counts as a drag rather than a tap. */
const SLOP_PX = 8;
/** Release beyond this distance (or 30% of the sheet) dismisses. */
const DISMISS_PX = 140;
/** A quick downward flick dismisses regardless of distance (px per ms). */
const FLICK_VELOCITY = 0.5;
const SETTLE_MS = 220;

/**
 * Lets a bottom sheet be dragged down to dismiss it. The drag can start anywhere on the sheet
 * except in a text field, or in scrollable content that is not scrolled to its top.
 */
export function useSwipeToDismiss(
  onDismiss: () => void,
): { sheetRef: RefObject<HTMLDivElement | null>; backdropRef: RefObject<HTMLDivElement | null> } {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    let phase: 'idle' | 'pending' | 'dragging' | 'closing' = 'idle';
    let scroller: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let base = 0;
    let offset = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let timer = 0;

    const render = () => {
      sheet.style.transform = offset > 0 ? `translateY(${offset}px)` : '';
      const backdrop = backdropRef.current;
      if (backdrop) backdrop.style.opacity = offset > 0 ? String(Math.max(0, 1 - offset / sheet.offsetHeight)) : '';
    };

    const settle = (to: 'open' | 'closed') => {
      const backdrop = backdropRef.current;
      sheet.classList.remove('is-dragging');
      sheet.classList.add('is-settling');
      backdrop?.classList.add('is-settling');
      if (to === 'closed') {
        phase = 'closing';
        sheet.style.transform = 'translateY(100%)';
        if (backdrop) backdrop.style.opacity = '0';
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        timer = window.setTimeout(() => dismissRef.current(), SETTLE_MS);
      } else {
        phase = 'idle';
        offset = 0;
        render();
        timer = window.setTimeout(() => {
          sheet.classList.remove('is-settling');
          backdrop?.classList.remove('is-settling');
        }, SETTLE_MS);
      }
    };

    const onStart = (e: TouchEvent) => {
      if (phase !== 'idle' || e.touches.length !== 1) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest('input, textarea, select')) return;
      window.clearTimeout(timer);
      sheet.classList.remove('is-settling');
      backdropRef.current?.classList.remove('is-settling');
      scroller = target.closest<HTMLElement>('.drawer__body');
      startX = e.touches[0].clientX;
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      velocity = 0;
      phase = 'pending';
    };

    const onMove = (e: TouchEvent) => {
      if (phase !== 'pending' && phase !== 'dragging') return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (phase === 'pending') {
        const scrolled = scroller !== null && scroller.scrollTop > 0;
        const sideways = Math.abs(dx) > SLOP_PX && Math.abs(dx) > Math.abs(dy);
        if (scrolled || sideways || dy < -SLOP_PX) {
          phase = 'idle';
          return;
        }
        if (dy <= SLOP_PX) return;
        // The browser already took this touch for scrolling; leave it alone.
        if (!e.cancelable) {
          phase = 'idle';
          return;
        }
        phase = 'dragging';
        base = dy;
        // Inline so the entrance animation never replays once the classes come off.
        sheet.style.animation = 'none';
        sheet.classList.add('is-dragging');
      }

      if (e.cancelable) e.preventDefault();
      offset = Math.max(0, dy - base);
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (touch.clientY - lastY) / dt;
      lastY = touch.clientY;
      lastT = e.timeStamp;
      render();
    };

    const onEnd = (e: TouchEvent) => {
      if (phase === 'pending') phase = 'idle';
      if (phase !== 'dragging') return;
      // A finger that rested before lifting is not a flick.
      const flick = e.timeStamp - lastT < 80 && velocity > FLICK_VELOCITY;
      const far = offset > Math.min(DISMISS_PX, sheet.offsetHeight * 0.3);
      settle(e.type === 'touchend' && (far || flick) ? 'closed' : 'open');
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      window.clearTimeout(timer);
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return { sheetRef, backdropRef };
}
