import { decodeRgba } from '../lib/zxingDecode';

export interface DecodeRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export interface DecodeResponse {
  id: number;
  text: string | null;
}

// The app compiles against the DOM lib, so describe just the worker scope we use.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
  postMessage: (message: DecodeResponse) => void;
};

scope.onmessage = (event) => {
  const { id, width, height, buffer } = event.data;
  const text = decodeRgba(new Uint8ClampedArray(buffer), width, height);
  scope.postMessage({ id, text });
};
