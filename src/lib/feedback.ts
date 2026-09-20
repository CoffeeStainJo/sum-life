/**
 * Scan feedback. iOS only lets us create/resume an AudioContext inside a user gesture,
 * so `primeAudio()` must be called from the tap that starts the camera; `beep()` can then
 * fire later from the decode callback.
 */
let audioContext: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function getCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

export function primeAudio(): void {
  try {
    const Ctor = getCtor();
    if (!Ctor) return;
    audioContext ??= new Ctor();
    if (audioContext.state === 'suspended') void audioContext.resume();
  } catch {
    audioContext = null;
  }
}

export function beep(): void {
  const ctx = audioContext;
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1400;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  } catch {
    /* audio is best-effort */
  }
}

export function vibrate(pattern: number | number[] = 60): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported (iOS Safari) */
  }
}

export function scanSuccessFeedback(): void {
  beep();
  vibrate([40, 40, 40]);
}
