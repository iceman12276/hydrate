import { DateTime } from 'luxon'

export interface DayBar {
  date: string // 'yyyy-MM-dd'
  totalMl: number
  metGoal: boolean
}

/**
 * The last `n` local days ending at `todayKey`, in chronological order, with
 * zero-filled gaps. Drives the 7/30-day History bars + goal line.
 */
export function lastNDays(
  buckets: Map<string, number>,
  todayKey: string,
  n: number,
  goalMl: number,
  zone: string,
): DayBar[] {
  const bars: DayBar[] = []
  let cursor = DateTime.fromISO(todayKey, { zone })
  for (let i = 0; i < n; i++) {
    const date = cursor.toFormat('yyyy-MM-dd')
    const totalMl = buckets.get(date) ?? 0
    bars.push({ date, totalMl, metGoal: totalMl >= goalMl })
    cursor = cursor.minus({ days: 1 })
  }
  return bars.reverse()
}

export function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Consecutive met-goal days ending today. Today not being met yet does NOT break
 * the streak (grace for an in-progress day) — it counts back from yesterday.
 */
export function computeStreak(
  buckets: Map<string, number>,
  todayKey: string,
  goalMl: number,
  zone: string,
): number {
  const met = (key: string) => (buckets.get(key) ?? 0) >= goalMl
  let cursor = DateTime.fromISO(todayKey, { zone })
  if (!met(todayKey)) cursor = cursor.minus({ days: 1 })
  let streak = 0
  while (met(cursor.toFormat('yyyy-MM-dd'))) {
    streak++
    cursor = cursor.minus({ days: 1 })
  }
  return streak
}
