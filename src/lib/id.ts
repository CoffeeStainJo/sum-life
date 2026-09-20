/** Stable unique ids. `crypto.randomUUID` needs a secure context, so keep a fallback for plain-HTTP LAN testing. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
