import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { defaultReminderSettings, type ReminderSettings } from '../schemas/reminder-settings'
import { bufferDepthHours, computeFireTimes, fixedTimesForRepeating } from './compute'
import type { ComputeOptions } from './types'

const NY = 'America/New_York'
const AKL = 'Pacific/Auckland'

function at(zone: string, y: number, mo: number, d: number, h: number, mi = 0): Date {
  return DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: mi },
    { zone },
  ).toJSDate()
}

function settings(over: Partial<ReminderSettings>): ReminderSettings {
  return { ...defaultReminderSettings('2026-06-22T00:00:00Z'), enabled: true, ...over }
}

function opts(
  over: Partial<ComputeOptions> & Pick<ComputeOptions, 'now' | 'zone'>,
): ComputeOptions {
  return {
    userId: 'u1',
    permissionGranted: true,
    maxOccurrences: 10,
    ...over,
  }
}

/** Local wall-clock hours of each occurrence, in the device zone. */
function localHours(occ: { fireAtLocal: string }[]): number[] {
  return occ.map((o) => DateTime.fromISO(o.fireAtLocal, { setZone: true }).hour)
}
function localHM(o: { fireAtLocal: string }): string {
  return DateTime.fromISO(o.fireAtLocal, { setZone: true }).toFormat('HH:mm')
}
function localDate(o: { fireAtLocal: string }): string {
  return DateTime.fromISO(o.fireAtLocal, { setZone: true }).toFormat('yyyy-MM-dd')
}

describe('guards', () => {
  it('returns [] when disabled', () => {
    const r = computeFireTimes(
      settings({ enabled: false }),
      opts({ now: at(NY, 2026, 6, 22, 12), zone: NY }),
    )
    expect(r).toEqual([])
  })
  it('returns [] without permission', () => {
    const r = computeFireTimes(
      settings({}),
      opts({ now: at(NY, 2026, 6, 22, 12), zone: NY, permissionGranted: false }),
    )
    expect(r).toEqual([])
  })
})

describe('interval mode — grid, window, new-user first occurrence', () => {
  const s = settings({
    mode: 'interval',
    intervalMinutes: 60,
    windowStart: '08:00',
    windowEnd: '22:00',
  })

  it('first occurrence is the next hourly slot after now', () => {
    const r = computeFireTimes(s, opts({ now: at(NY, 2026, 6, 22, 12, 30), zone: NY }))
    expect(r.length).toBe(10)
    expect(localHM(r[0]!)).toBe('13:00')
  })

  it('never fires outside the active window [08:00, 22:00)', () => {
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 6, 22, 5), zone: NY, maxOccurrences: 40 }),
    )
    for (const h of localHours(r)) {
      expect(h).toBeGreaterThanOrEqual(8)
      expect(h).toBeLessThan(22)
    }
  })

  it('works in a southern-hemisphere zone', () => {
    const r = computeFireTimes(s, opts({ now: at(AKL, 2026, 6, 22, 12, 30), zone: AKL }))
    expect(localHM(r[0]!)).toBe('13:00')
  })
})

describe('interval mode — wrap-around window 20:00–02:00 (the seam)', () => {
  it('produces one continuous hourly sequence with no seam gap or duplicate', () => {
    const s = settings({
      mode: 'interval',
      intervalMinutes: 60,
      windowStart: '20:00',
      windowEnd: '02:00',
    })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 6, 22, 19), zone: NY, maxOccurrences: 12 }),
    )
    expect(localHours(r)).toEqual([20, 21, 22, 23, 0, 1, 20, 21, 22, 23, 0, 1])
    // 02:00 is the exclusive end — never present
    expect(localHours(r)).not.toContain(2)
    // strictly increasing instants (no duplicate at the midnight seam)
    const utcs = r.map((o) => o.fireAtUtc)
    expect(new Set(utcs).size).toBe(utcs.length)
  })
})

describe('quiet hours — wrap-aware 22:00–07:00, quiet wins', () => {
  it('suppresses interval slots inside quiet hours', () => {
    const s = settings({
      mode: 'interval',
      intervalMinutes: 60,
      windowStart: '06:00',
      windowEnd: '23:00',
      quietStart: '22:00',
      quietEnd: '07:00',
    })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 6, 22, 0), zone: NY, maxOccurrences: 40 }),
    )
    for (const h of localHours(r)) {
      expect(h).toBeGreaterThanOrEqual(7)
      expect(h).toBeLessThanOrEqual(21)
    }
  })
})

describe('fixed times mode', () => {
  it('fires at the named times and bypasses the active window', () => {
    const s = settings({
      mode: 'times',
      times: ['23:30'],
      windowStart: '08:00',
      windowEnd: '22:00',
    })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 6, 22, 10), zone: NY, maxOccurrences: 3 }),
    )
    expect(r.map(localHM)).toEqual(['23:30', '23:30', '23:30'])
  })

  it('same-day catch-up: skips times already past today', () => {
    const s = settings({ mode: 'times', times: ['09:00', '13:30', '18:00'] })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 6, 22, 10), zone: NY, maxOccurrences: 2 }),
    )
    expect(r.map(localHM)).toEqual(['13:30', '18:00'])
  })

  it('quiet hours win over a fixed time', () => {
    const s = settings({
      mode: 'times',
      times: ['23:00', '09:00'],
      quietStart: '22:00',
      quietEnd: '07:00',
    })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 6, 22, 0), zone: NY, maxOccurrences: 5 }),
    )
    expect(localHours(r).every((h) => h === 9)).toBe(true)
  })
})

describe('DST correctness (America/New_York)', () => {
  it('spring-forward: interval skips the 02:00 gap slot, no duplicate', () => {
    // 2026-03-08: 02:00 -> 03:00
    const s = settings({
      mode: 'interval',
      intervalMinutes: 60,
      windowStart: '01:00',
      windowEnd: '05:00',
    })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 3, 8, 0, 30), zone: NY, maxOccurrences: 4 }),
    )
    const day = r.filter((o) => localDate(o) === '2026-03-08')
    const hours = day.map((o) => DateTime.fromISO(o.fireAtLocal, { setZone: true }).hour)
    expect(hours).toEqual([1, 3, 4]) // 02:00 skipped
  })

  it('spring-forward: a fixed 02:30 shifts to the next valid instant', () => {
    const s = settings({ mode: 'times', times: ['02:30'] })
    const r = computeFireTimes(s, opts({ now: at(NY, 2026, 3, 8, 0), zone: NY, maxOccurrences: 1 }))
    expect(localDate(r[0]!)).toBe('2026-03-08')
    expect(DateTime.fromISO(r[0]!.fireAtLocal, { setZone: true }).hour).toBe(3)
  })

  it('fall-back: an ambiguous 01:30 fires exactly once', () => {
    // 2026-11-01: 02:00 -> 01:00 (01:00–02:00 occurs twice)
    const s = settings({ mode: 'times', times: ['01:30'] })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 11, 1, 0), zone: NY, maxOccurrences: 5 }),
    )
    const onDst = r.filter((o) => localDate(o) === '2026-11-01' && localHM(o) === '01:30')
    expect(onDst.length).toBe(1)
  })
})

describe('horizon & caps', () => {
  it('dynamic horizon fills the budget for a sparse (one/day) schedule', () => {
    const s = settings({ mode: 'times', times: ['09:00'] })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 6, 22, 10), zone: NY, maxOccurrences: 30 }),
    )
    expect(r.length).toBe(30)
    const spanDays = DateTime.fromISO(r[29]!.fireAtUtc).diff(
      DateTime.fromISO(r[0]!.fireAtUtc),
      'days',
    ).days
    expect(spanDays).toBeGreaterThan(25) // genuinely ~29 days out, not drained in a few
  })

  it('truncates to exactly maxOccurrences for a dense schedule', () => {
    const s = settings({
      mode: 'interval',
      intervalMinutes: 15,
      windowStart: '08:00',
      windowEnd: '22:00',
    })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 6, 22, 7), zone: NY, maxOccurrences: 60 }),
    )
    expect(r.length).toBe(60)
  })

  it('occurrences are sorted ascending by UTC instant', () => {
    const s = settings({
      mode: 'interval',
      intervalMinutes: 30,
      windowStart: '06:00',
      windowEnd: '23:00',
    })
    const r = computeFireTimes(
      s,
      opts({ now: at(NY, 2026, 6, 22, 5), zone: NY, maxOccurrences: 20 }),
    )
    const utcs = r.map((o) => o.fireAtUtc)
    expect([...utcs].sort()).toEqual(utcs)
  })
})

describe('deterministic ids', () => {
  it('same settings + now -> identical ids (idempotent re-arm)', () => {
    const s = settings({ mode: 'interval', intervalMinutes: 60 })
    const o = opts({ now: at(NY, 2026, 6, 22, 12), zone: NY })
    expect(computeFireTimes(s, o).map((x) => x.id)).toEqual(computeFireTimes(s, o).map((x) => x.id))
  })

  it('changing updatedAt changes ids (forces reschedule)', () => {
    const o = opts({ now: at(NY, 2026, 6, 22, 12), zone: NY })
    const a = computeFireTimes(settings({ updatedAt: '2026-06-22T00:00:00Z' }), o)
    const b = computeFireTimes(settings({ updatedAt: '2026-06-22T01:00:00Z' }), o)
    expect(a[0]!.id).not.toBe(b[0]!.id)
  })
})

describe('bufferDepthHours', () => {
  it('interval 15min / 16h window / N=60 is under a day', () => {
    const s = settings({
      mode: 'interval',
      intervalMinutes: 15,
      windowStart: '06:00',
      windowEnd: '22:00',
    })
    expect(bufferDepthHours(s, 60)).toBeLessThan(24)
  })
  it('one fixed time/day with N=60 buys ~60 days', () => {
    const s = settings({ mode: 'times', times: ['09:00'] })
    expect(bufferDepthHours(s, 60)).toBe(60 * 24)
  })
})

describe('fixedTimesForRepeating', () => {
  it('drops fixed times that fall in quiet hours', () => {
    const s = settings({
      mode: 'times',
      times: ['23:00', '09:00'],
      quietStart: '22:00',
      quietEnd: '07:00',
    })
    expect(fixedTimesForRepeating(s)).toEqual(['09:00'])
  })
  it('is empty for interval mode', () => {
    expect(fixedTimesForRepeating(settings({ mode: 'interval' }))).toEqual([])
  })
})
