const pad = (n: number): string => String(n).padStart(2, '0');

/** Local-time date key in YYYY-MM-DD form. The journal is keyed by the user's wall-clock day, not UTC. */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function yesterdayKey(now: Date = new Date()): string {
  // Constructing from components lets the Date object handle month/year underflow in local time.
  return toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

/** The only two date keys the app keeps in storage. */
export function retainedKeys(now: Date = new Date()): [today: string, yesterday: string] {
  return [todayKey(now), yesterdayKey(now)];
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseDateKey(key: string): Date | null {
  if (!isDateKey(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Thursday, 18 Sept" style heading for the journal header. */
export function formatDateHeading(key: string, locale?: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(date);
}
