/** Turn any thrown value into a short message suitable for the UI. */
export function errorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return '';
  // fetch() rejects with a TypeError for offline, DNS and CORS failures alike. Open Food Facts
  // occasionally serves a 503 page without CORS headers, which lands here too.
  if (err instanceof TypeError) return 'Could not reach Open Food Facts. Check your connection or try again in a moment.';
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong.';
}
