/** 'HH:mm' -> minutes since local midnight (0..1439). Assumes schema-valid input. */
export function parseHhmm(t: string): number {
  const parts = t.split(':')
  return Number(parts[0]) * 60 + Number(parts[1])
}

/**
 * Half-open [start, end) membership on a 1440-minute clock, wrap-aware.
 * Caller guarantees start !== end (schema CHECK), so an all-day true/false is
 * never produced by equal bounds.
 */
export function inHalfOpenWindow(minute: number, start: number, end: number): boolean {
  if (start < end) return minute >= start && minute < end
  // wraps past midnight, e.g. 20:00..02:00
  return minute >= start || minute < end
}

/** Number of interval slots that fit in a wrap-aware window of `lenMinutes`. */
export function slotCount(lenMinutes: number, intervalMinutes: number): number {
  return Math.max(1, Math.ceil(lenMinutes / intervalMinutes))
}

/** Length in minutes of a wrap-aware window [start, end). start !== end. */
export function windowLength(startMin: number, endMin: number): number {
  const len = (endMin - startMin + 1440) % 1440
  return len === 0 ? 1440 : len
}

/** djb2 string hash -> unsigned base36. Stable across runtimes for ids. */
export function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}
