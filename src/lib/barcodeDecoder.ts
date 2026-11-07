import type { DecodeRequest, DecodeResponse } from '../workers/barcode.worker';

/** Decodes one cropped camera frame that has already been drawn onto `canvas`. */
export interface FrameDecoder {
  /** How many identical reads in a row are needed before a result is trusted. */
  readonly confirmations: number;
  decode(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<string | null>;
  dispose(): void;
}

const RETAIL_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

// Shape of the Barcode Detection API, which TypeScript's DOM lib does not include yet.
interface DetectedBarcode {
  rawValue: string;
}
interface NativeDetector {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface NativeDetectorCtor {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * Prefer the browser's built-in detector (fast, runs off the main thread). Otherwise decode with
 * zxing in a Web Worker so the UI never stalls while frames are processed. Never rejects.
 */
export async function createFrameDecoder(): Promise<FrameDecoder> {
  const native = await createNativeDecoder();
  return native ? withWorkerFallback(native) : createWorkerDecoder();
}

async function createNativeDecoder(): Promise<FrameDecoder | null> {
  const Ctor = (globalThis as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = await Ctor.getSupportedFormats();
    const formats = RETAIL_FORMATS.filter((f) => supported.includes(f));
    if (!formats.includes('ean_13')) return null;
    const detector = new Ctor({ formats });
    return {
      confirmations: 1,
      async decode(canvas) {
        const [first] = await detector.detect(canvas);
        return first?.rawValue ?? null;
      },
      dispose() {},
    };
  } catch {
    return null;
  }
}

function createWorkerDecoder(): FrameDecoder {
  const worker = new Worker(new URL('../workers/barcode.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, (text: string | null) => void>();
  let nextId = 0;

  const settleAll = () => {
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
  };

  worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
    const { id, text } = event.data;
    pending.get(id)?.(text);
    pending.delete(id);
  };
  // If the worker cannot load, resolve rather than leave the scan loop waiting forever.
  worker.onerror = settleAll;

  return {
    // zxing occasionally misreads a digit on a blurry frame; two matching reads filter that out.
    confirmations: 2,
    decode(canvas, ctx) {
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        const message: DecodeRequest = { id, width: canvas.width, height: canvas.height, buffer: data.buffer };
        worker.postMessage(message, [data.buffer]);
      });
    },
    dispose() {
      worker.terminate();
      settleAll();
    },
  };
}

/** Some browsers expose BarcodeDetector but fail at detect time; switch to the worker if that happens. */
function withWorkerFallback(native: FrameDecoder): FrameDecoder {
  let active = native;
  return {
    get confirmations() {
      return active.confirmations;
    },
    async decode(canvas, ctx) {
      try {
        return await active.decode(canvas, ctx);
      } catch {
        if (active === native) active = createWorkerDecoder();
        return null;
      }
    },
    dispose() {
      active.dispose();
    },
  };
}
