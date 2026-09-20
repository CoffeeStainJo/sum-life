import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Camera, CircleOff, Keyboard, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { primeAudio, scanSuccessFeedback } from '../lib/feedback';
import { normalizeBarcode } from '../lib/openFoodFacts';
import { Spinner } from './Spinner';

type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'denied' | 'unavailable' | 'insecure' | 'error';

interface Props {
  onDetected: (barcode: string) => void;
  /** While true the camera is released (e.g. during a product lookup). */
  paused?: boolean;
}

/** Only retail product symbologies: keeps decoding fast and avoids false positives from QR codes etc. */
const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
  [DecodeHintType.TRY_HARDER, true],
]);

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

export function BarcodeScanner({ onDetected, paused = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  /** Bumped on every start/stop so callbacks from a previous camera session are ignored. */
  const sessionRef = useRef(0);
  const onDetectedRef = useRef(onDetected);

  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const start = useCallback(async () => {
    // Must run inside the tap so iOS lets us create/resume the AudioContext for the beep.
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

    stop();
    const session = sessionRef.current;
    setStatus('starting');
    setMessage(null);

    const reader = new BrowserMultiFormatReader(HINTS, {
      delayBetweenScanAttempts: 150,
      delayBetweenScanSuccess: 1500,
    });

    try {
      const controls = await reader.decodeFromConstraints(CONSTRAINTS, video, (result, _error, ctl) => {
        if (!result || sessionRef.current !== session) return;
        const code = normalizeBarcode(result.getText());
        if (code.length < MIN_BARCODE_DIGITS) return;

        sessionRef.current += 1;
        ctl.stop();
        controlsRef.current = null;
        scanSuccessFeedback();
        setStatus('idle');
        onDetectedRef.current(code);
      });

      if (sessionRef.current !== session) {
        // Stopped or unmounted while the camera was warming up.
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setStatus('scanning');
    } catch (err) {
      if (sessionRef.current !== session) return;
      const described = describeError(err);
      setStatus(described.status);
      setMessage(described.message);
      setShowManual(true);
    }
  }, [stop]);

  // Release the camera whenever the parent pauses us.
  useEffect(() => {
    if (!paused) return;
    stop();
    setStatus((s) => (s === 'scanning' || s === 'starting' ? 'idle' : s));
  }, [paused, stop]);

  // ...and on unmount.
  useEffect(() => () => stop(), [stop]);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const code = normalizeBarcode(manualCode);
    if (code.length < MIN_BARCODE_DIGITS) return;
    stop();
    setStatus('idle');
    setManualCode('');
    onDetectedRef.current(code);
  };

  const live = status === 'scanning';
  const failed = status === 'denied' || status === 'unavailable' || status === 'insecure' || status === 'error';
  const manualValid = normalizeBarcode(manualCode).length >= MIN_BARCODE_DIGITS;

  return (
    <div className="scanner">
      <div className={`scanner__viewport${live ? ' is-live' : ''}`}>
        {/* playsInline + muted are required for iOS Safari to render a live camera stream inline. */}
        <video ref={videoRef} className="scanner__video" playsInline muted autoPlay />
        {live && <div className="scanner__reticle" aria-hidden="true" />}

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

      {live && (
        <div className="scanner__actions">
          <p className="hint">Point the camera at an EAN or UPC barcode.</p>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              stop();
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
