import { describe, expect, it } from 'vitest'
import { bucketByLocalDay, localDayKey, totalForDay } from './day-bucket'
import { goalProgress } from './goal'
import { average, computeStreak, lastNDays } from './stats'

const NY = 'America/New_York'

describe('goalProgress', () => {
  it('computes remaining, clamped ratio, percent, metGoal', () => {
    expect(goalProgress(1500, 2000)).toMatchObject({
      remainingMl: 500,
      ratio: 0.75,
      percent: 75,
      metGoal: false,
    })
  })
  it('clamps ratio at 1 and remaining at 0 when over goal', () => {
    const p = goalProgress(2500, 2000)
    expect(p.ratio).toBe(1)
    expect(p.remainingMl).toBe(0)
    expect(p.metGoal).toBe(true)
  })
  it('handles a zero/invalid goal without dividing by zero', () => {
    expect(goalProgress(100, 0).ratio).toBe(1)
  })
})

describe('day bucketing — DST / midnight correctness', () => {
  it('buckets an early-UTC instant into the previous local day (NY)', () => {
    // 03:00Z on 2026-06-22 is 23:00 on 2026-06-21 in EDT
    expect(localDayKey('2026-06-22T03:00:00Z', NY)).toBe('2026-06-21')
  })

  it('buckets correctly across the fall-back day', () => {
    // 2026-11-01 fall-back: both 05:30Z (01:30 EDT) and 06:30Z (01:30 EST) are Nov 1 local
    const entries = [
      { loggedAt: '2026-11-01T05:30:00Z', amountMl: 250 },
      { loggedAt: '2026-11-01T06:30:00Z', amountMl: 300 },
    ]
    expect(totalForDay(entries, NY, '2026-11-01')).toBe(550)
  })

  it('sums multiple entries per local day', () => {
    const buckets = bucketByLocalDay(
      [
        { loggedAt: '2026-06-22T13:00:00Z', amountMl: 250 },
        { loggedAt: '2026-06-22T18:00:00Z', amountMl: 500 },
        { loggedAt: '2026-06-23T13:00:00Z', amountMl: 750 },
      ],
      NY,
    )
    expect(buckets.get('2026-06-22')).toBe(750)
    expect(buckets.get('2026-06-23')).toBe(750)
  })
})

describe('lastNDays', () => {
  it('returns n chronological days, zero-filling gaps, with goal-met flags', () => {
    const buckets = new Map([
      ['2026-06-22', 2000],
      ['2026-06-20', 1000],
    ])
    const bars = lastNDays(buckets, '2026-06-22', 3, 2000, NY)
    expect(bars.map((b) => b.date)).toEqual(['2026-06-20', '2026-06-21', '2026-06-22'])
    expect(bars.map((b) => b.totalMl)).toEqual([1000, 0, 2000])
    expect(bars.map((b) => b.metGoal)).toEqual([false, false, true])
  })
})

describe('computeStreak', () => {
  const goal = 2000
  it('counts consecutive met days ending today', () => {
    const buckets = new Map([
      ['2026-06-22', 2100],
      ['2026-06-21', 2000],
      ['2026-06-20', 2500],
      ['2026-06-19', 500], // breaks it
    ])
    expect(computeStreak(buckets, '2026-06-22', goal, NY)).toBe(3)
  })

  it('does not break the streak when today is not yet met (grace)', () => {
    const buckets = new Map([
      ['2026-06-22', 100], // today, not met yet
      ['2026-06-21', 2000],
      ['2026-06-20', 2000],
    ])
    expect(computeStreak(buckets, '2026-06-22', goal, NY)).toBe(2)
  })

  it('resets to 0 when neither today nor yesterday met goal', () => {
    const buckets = new Map([['2026-06-20', 2000]])
    expect(computeStreak(buckets, '2026-06-22', goal, NY)).toBe(0)
  })
})

describe('average', () => {
  it('averages and handles empty input', () => {
    expect(average([1000, 2000, 3000])).toBe(2000)
    expect(average([])).toBe(0)
  })
})
