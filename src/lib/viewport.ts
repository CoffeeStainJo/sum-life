/**
 * iOS Safari does not resize the layout when the on-screen keyboard opens: it only shrinks the
 * *visual* viewport, so a fixed-height app shell ends up hidden behind the keyboard. This mirrors
 * the visual viewport into CSS variables (`--vv-top`, `--vv-height`) that the shell and the drawer
 * size themselves with, and keeps the focused field in view.
 */

/** Smallest height loss we treat as a keyboard rather than browser chrome collapsing. */
const KEYBOARD_MIN_PX = 120;

function isTextField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export function trackVisualViewport(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};

  const root = document.documentElement;
  let frame = 0;
  let keyboardOpen = false;

  const revealFocused = () => {
    const el = document.activeElement;
    if (isTextField(el)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const apply = () => {
    frame = 0;
    // Pinch-zoom also shrinks the visual viewport; leave the layout alone then.
    if (vv.scale > 1.01) return;

    root.style.setProperty('--vv-top', `${Math.max(0, vv.offsetTop)}px`);
    root.style.setProperty('--vv-height', `${vv.height}px`);

    const open = window.innerHeight - vv.height > KEYBOARD_MIN_PX && isTextField(document.activeElement);
    if (open !== keyboardOpen) {
      keyboardOpen = open;
      root.toggleAttribute('data-keyboard', open);
    }
    if (open) revealFocused();
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };

  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  // Moving between fields while the keyboard stays up does not resize anything.
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  apply();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    vv.removeEventListener('resize', schedule);
    vv.removeEventListener('scroll', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
  };
}
