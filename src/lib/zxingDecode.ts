import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

/** Only retail product symbologies: keeps decoding fast and avoids false positives from QR codes etc. */
const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
  [DecodeHintType.TRY_HARDER, true],
]);

const reader = new MultiFormatReader();
reader.setHints(HINTS);

/** Decode a retail barcode from RGBA pixels. Returns the barcode text, or null if none was found. */
export function decodeRgba(rgba: Uint8ClampedArray, width: number, height: number): string | null {
  const size = width * height;
  const luminance = new Uint8ClampedArray(size);
  for (let i = 0, p = 0; i < size; i += 1, p += 4) {
    // Green-weighted average, same as zxing's own RGB conversion.
    luminance[i] = (rgba[p] + 2 * rgba[p + 1] + rgba[p + 2]) >> 2;
  }

  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)));
    return reader.decodeWithState(bitmap).getText();
  } catch {
    // zxing throws NotFoundException (and friends) when a frame has no readable barcode.
    return null;
  } finally {
    reader.reset();
  }
}
