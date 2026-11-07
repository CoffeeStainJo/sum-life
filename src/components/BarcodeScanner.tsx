import { Camera, CircleOff, Keyboard, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { createFrameDecoder, type FrameDecoder } from '../lib/barcodeDecoder';
import { primeAudio, scanSuccessFeedback } from '../lib/feedback';
import { normalizeBarcode } from '../lib/openFoodFacts';
import { RETICLE, createReadConfirmer, fitWithin, reticleToVideoRect } from '../lib/scanning';
import { Spinner } from './Spinner';

type ScannerStatus = 'idle' | 'starting' | 'live' | 'denied' | 'unavailable' | 'insecure' | 'error';

interface Props {
  /** Called once per detected (or typed) barcode. The parent should set `paused` while it handles it. */
  onDetected: (barcode: string) => void;
  /**
   * While true the last frame stays frozen on screen and decoding stops. The camera stays on,
   * so scanning resumes instantly when this goes back to false.
   */
  paused?: boolean;
  /** Short status shown over the camera view, e.g. while a product is looked up. */
  statusText?: string | null;
}

/** Back camera preferred, but `ideal` lets laptops without one still work. */
const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

const MIN_BARCODE_DIGITS = 8;
/** Longest side of the cropped frame handed to the decoder. Plenty for EAN/UPC, cheap to process. */
const MAX_DECODE_SIDE = 800;
/** Floor between decode attempts, so a fast decoder does not spin the CPU (and battery) flat out. */
const MIN_FRAME_INTERVAL_MS = 60;

const RETICLE_STYLE: CSSProperties = {
  left: `${RETICLE.x * 100}%`,
  top: `${RETICLE.y * 100}%`,
  width: `${RETICLE.width * 100}%`,
  height: `${RETICLE.height * 100}%`,
};

function describeError(err: unknown): { status: ScannerStatus; message: string } {
  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        status: 'denied',
        message:
          'Camera access was denied. Allow it for this site in Settings > Safari > Camera (or the browser site settings), then try again. You can also type the barcode below.',
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'NotReadableError':
    case 'AbortError':
      return { status: 'unavailable', message: 'No usable camera was found, or another app is using it.' };
    default:
      return {
        status: 'error',
        message: err instanceof Error && err.message ? err.message : 'The camera could not be started.',
      };
  }
}

/** Ask for continuous autofocus where the browser lets us (mostly Android); iOS already does this. */
async function preferContinuousFocus(track: MediaStreamTrack | undefined): Promise<void> {
  try {
    const caps = track?.getCapabilities?.() as { focusMode?: string[] } | undefined;
    if (track && caps?.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
    }
  } catch {
    /* best-effort */
  }
}

export function BarcodeScanner({ onDetected, paused = false, statusText = null }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<Promise<FrameDecoder> | null>(null);
  const confirmerRef = useRef(createReadConfirmer());
  /** Bumped whenever the camera starts or stops, so async work from an older camera session is ignored. */
  const sessionRef = useRef(0);
  /** Bumped whenever the decode loop starts or stops, so at most one loop ever runs. */
  const loopRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const pausedRef = useRef(paused);
  /** Set the moment a code is accepted, before the parent has had a chance to pause us. */
  const lockedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);

  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [detected, setDetected] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stopLoop = useCallback(() => {
    loopRef.current += 1;
    window.clearTimeout(timerRef.current);
  }, []);

  /** Crop the reticle area out of the current video frame and decode it. */
  const decodeFrame = useCallback(async (decoder: FrameDecoder): Promise<string | null> => {
    const video = videoRef.current;
    const viewport = viewportRef.current;
    if (!video || !viewport || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return null;

    const src = reticleToVideoRect(video.videoWidth, video.videoHeight, viewport.clientWidth, viewport.clientHeight);
    if (src.width < 2 || src.height < 2) return null;
    const out = fitWithin(src.width, src.height, MAX_DECODE_SIDE);

    const canvas = (canvasRef.current ??= document.createElement('canvas'));
    if (canvas.width !== out.width) canvas.width = out.width;
    if (canvas.height !== out.height) canvas.height = out.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, src.x, src.y, src.width, src.height, 0, 0, out.width, out.height);
    return decoder.decode(canvas, ctx);
  }, []);

  const accept = useCallback(
    (code: string) => {
      lockedRef.current = true;
      stopLoop();
      // Freeze the frame that was read, so it is obvious what was captured.
      videoRef.current?.pause();
      scanSuccessFeedback();
      setDetected(true);
      onDetectedRef.current(code);
    },
    [stopLoop],
  );

  const startLoop = useCallback(async () => {
    stopLoop();
    const loop = loopRef.current;
    const decoder = await decoderRef.current;
    if (!decoder) return;
    const stale = () => loop !== loopRef.current || lockedRef.current || pausedRef.current;

    const tick = async () => {
      if (stale()) return;
      const startedAt = performance.now();
      const raw = await decodeFrame(decoder);
      if (stale()) return;

      const code = raw ? normalizeBarcode(raw) : '';
      if (code.length >= MIN_BARCODE_DIGITS) {
        const confirmed = confirmerRef.current.push(code, performance.now(), decoder.confirmations);
        if (confirmed) {
          accept(confirmed);
          return;
        }
      }
      const elapsed = performance.now() - startedAt;
      timerRef.current = window.setTimeout(() => void tick(), Math.max(0, MIN_FRAME_INTERVAL_MS - elapsed));
    };
    void tick();
  }, [accept, decodeFrame, stopLoop]);

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    stopLoop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    lockedRef.current = false;
    setDetected(false);
  }, [stopLoop]);

  const start = useCallback(async () => {
    // Inside a tap this unlocks audio for the success beep on iOS; elsewhere it is harmless.
    primeAudio();

    if (!window.isSecureContext) {
      setStatus('insecure');
      setMessage('The camera only works over HTTPS. Type the barcode instead.');
      setShowManual(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      setMessage('This browser does not support camera access.');
      setShowManual(true);
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    stopCamera();
    const session = sessionRef.current;
    setStatus('starting');
    setMessage(null);

    // Load the decoder while the camera warms up, and keep it for later camera sessions.
    decoderRef.current ??= createFrameDecoder();

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
      if (session !== sessionRef.current) {
        // Stopped or unmounted while the camera was starting.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const [track] = stream.getVideoTracks();
      // iOS ends the track when the app goes to the background; offer a clean restart.
      track?.addEventListener('ended', () => {
        if (session !== sessionRef.current) return;
        stopCamera();
        setStatus('idle');
      });
      void preferContinuousFocus(track);

      video.srcObject = stream;
      await video.play();
      await decoderRef.current;
      if (session !== sessionRef.current) return;

      confirmerRef.current.reset();
      setStatus('live');
      if (!pausedRef.current) void startLoop();
    } catch (err) {
      if (session !== sessionRef.current) return;
      stopCamera();
      const described = describeError(err);
      setStatus(described.status);
      setMessage(described.message);
      setShowManual(true);
    }
  }, [startLoop, stopCamera]);

  // Freeze while the parent is busy; pick up scanning again the moment it is done.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      stopLoop();
      videoRef.current?.pause();
      return;
    }
    if (!streamRef.current) return;
    lockedRef.current = false;
    setDetected(false);
    confirmerRef.current.reset();
    void videoRef.current?.play().catch(() => {});
    void startLoop();
  }, [paused, startLoop, stopLoop]);

  // Opening the Scan tab is the intent to scan, so start the camera right away. Deferred a tick so
  // React's StrictMode double-mount in dev does not request the camera twice.
  useEffect(() => {
    const timer = window.setTimeout(() => void start(), 0);
    return () => window.clearTimeout(timer);
  }, [start]);

  // Release the camera and the decoder on unmount.
  useEffect(
    () => () => {
      stopCamera();
      void decoderRef.current?.then((d) => d.dispose());
      decoderRef.current = null;
    },
    [stopCamera],
  );

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const code = normalizeBarcode(manualCode);
    if (code.length < MIN_BARCODE_DIGITS) return;
    setManualCode('');
    onDetectedRef.current(code);
  };

  const live = status === 'live';
  const frozen = live && (detected || paused);
  const failed = status === 'denied' || status === 'unavailable' || status === 'insecure' || status === 'error';
  const manualValid = normalizeBarcode(manualCode).length >= MIN_BARCODE_DIGITS;

  const viewportClass = [
    'scanner__viewport',
    live && 'is-live',
    frozen && 'is-frozen',
    detected && 'is-detected',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="scanner">
      <div ref={viewportRef} className={viewportClass}>
        {/* playsInline + muted are required for iOS Safari to render a live camera stream inline. */}
        <video ref={videoRef} className="scanner__video" playsInline muted autoPlay />
        {live && <div className="scanner__reticle" style={RETICLE_STYLE} aria-hidden="true" />}
        {live && statusText && (
          <div className="scanner__status">
            <Spinner label={statusText} />
          </div>
        )}

        {status === 'idle' && (
          <div className="scanner__overlay">
            <button type="button" className="btn btn--primary" onClick={() => void start()}>
              <Camera size={20} /> Start camera
            </button>
          </div>
        )}
        {status === 'starting' && (
          <div className="scanner__overlay">
            <Spinner label="Starting camera…" />
          </div>
        )}
        {failed && (
          <div className="scanner__overlay scanner__overlay--error" role="alert">
            {status === 'denied' ? <CircleOff size={28} /> : <TriangleAlert size={28} />}
            <p>{message}</p>
            {status !== 'insecure' && (
              <button type="button" className="btn btn--ghost" onClick={() => void start()}>
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      {!live && statusText && <Spinner label={statusText} />}

      {live && (
        <div className="scanner__actions">
          <p className="hint">{detected ? 'Barcode captured.' : 'Point the camera at an EAN or UPC barcode.'}</p>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              stopCamera();
              setStatus('idle');
            }}
          >
            Stop camera
          </button>
        </div>
      )}

      <button
        type="button"
        className="btn btn--ghost btn--block"
        aria-expanded={showManual}
        onClick={() => setShowManual((v) => !v)}
      >
        <Keyboard size={18} /> Type the barcode instead
      </button>

      {showManual && (
        <form className="manual-code" onSubmit={submitManual}>
          <input
            className="input"
            inputMode="numeric"
            pattern="[0-9 ]*"
            autoComplete="off"
            placeholder="e.g. 5000159484695"
            aria-label="Barcode digits"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <button type="submit" className="btn btn--primary" disabled={!manualValid}>
            Look up
          </button>
        </form>
      )}
    </div>
  );
}
