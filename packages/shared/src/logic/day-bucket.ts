import { DateTime } from 'luxon'

export interface DatedAmount {
  /** ISO 8601 instant (with offset or Z). */
  loggedAt: string
  amountMl: number
}

/**
 * Local calendar date ('yyyy-MM-dd') an instant falls on in `zone`. DST/midnight
 * correct: a 03:00Z entry buckets to the previous local day in America/New_York.
 * This mirrors the server-side `(logged_at AT TIME ZONE tz)::date` bucketing.
 */
export function localDayKey(loggedAtIso: string, zone: string): string {
  return DateTime.fromISO(loggedAtIso, { zone }).toFormat('yyyy-MM-dd')
}

/** Sum amounts into local-day buckets. */
export function bucketByLocalDay(entries: DatedAmount[], zone: string): Map<string, number> {
  const buckets = new Map<string, number>()
  for (const entry of entries) {
    const key = localDayKey(entry.loggedAt, zone)
    buckets.set(key, (buckets.get(key) ?? 0) + entry.amountMl)
  }
  return buckets
}

/** Total ml logged on `dayKey` (local). */
export function totalForDay(entries: DatedAmount[], zone: string, dayKey: string): number {
  return bucketByLocalDay(entries, zone).get(dayKey) ?? 0
}
