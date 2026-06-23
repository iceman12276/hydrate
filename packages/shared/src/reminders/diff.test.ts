import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { defaultReminderSettings } from '../schemas/reminder-settings'
import { computeFireTimes } from './compute'
import { diffSchedule, rearm } from './diff'
import type { NotificationScheduler, Occurrence } from './types'

function occ(id: string): Occurrence {
  return {
    id,
    fireAtUtc: '2026-06-22T12:00:00.000Z',
    fireAtLocal: '2026-06-22T08:00:00.000-04:00',
    title: 't',
    body: 'b',
    payload: { url: '/dashboard', tag: 'hydrate-reminder' },
  }
}

class MemScheduler implements NotificationScheduler {
  pending = new Map<string, Occurrence>()
  async getPending() {
    return [...this.pending.values()].map((o) => ({ id: o.id }))
  }
  async schedule(o: Occurrence) {
    this.pending.set(o.id, o)
  }
  async cancel(ids: string[]) {
    for (const id of ids) this.pending.delete(id)
  }
  async cancelAll() {
    this.pending.clear()
  }
}

describe('diffSchedule', () => {
  it('schedules missing and cancels stale', () => {
    const { toSchedule, toCancel } = diffSchedule(
      [occ('a'), occ('b'), occ('c')],
      [{ id: 'b' }, { id: 'c' }, { id: 'd' }],
    )
    expect(toSchedule.map((o) => o.id)).toEqual(['a'])
    expect(toCancel).toEqual(['d'])
  })

  it('is a no-op when desired equals pending', () => {
    const desired = [occ('a'), occ('b')]
    const { toSchedule, toCancel } = diffSchedule(desired, [{ id: 'a' }, { id: 'b' }])
    expect(toSchedule).toEqual([])
    expect(toCancel).toEqual([])
  })
})

describe('rearm', () => {
  it('arms all, then re-running is idempotent, then [] cancels all', async () => {
    const s = {
      ...defaultReminderSettings('2026-06-22T00:00:00Z'),
      enabled: true,
      mode: 'interval' as const,
    }
    const now = DateTime.fromObject(
      { year: 2026, month: 6, day: 22, hour: 12 },
      { zone: 'America/New_York' },
    ).toJSDate()
    const desired = computeFireTimes(s, {
      userId: 'u1',
      zone: 'America/New_York',
      permissionGranted: true,
      now,
      maxOccurrences: 10,
    })
    expect(desired.length).toBe(10)

    const sched = new MemScheduler()
    const first = await rearm(desired, sched)
    expect(first.scheduled).toBe(10)
    expect(first.canceled).toBe(0)
    expect((await sched.getPending()).length).toBe(10)

    const second = await rearm(desired, sched)
    expect(second).toEqual({ scheduled: 0, canceled: 0 })

    const cleared = await rearm([], sched)
    expect(cleared.canceled).toBe(10)
    expect((await sched.getPending()).length).toBe(0)
  })

  it('reschedules when the schedule token (updatedAt) changes', async () => {
    const base = {
      ...defaultReminderSettings('2026-06-22T00:00:00Z'),
      enabled: true,
      mode: 'interval' as const,
    }
    const now = DateTime.fromObject(
      { year: 2026, month: 6, day: 22, hour: 12 },
      { zone: 'America/New_York' },
    ).toJSDate()
    const computeOpts = {
      userId: 'u1',
      zone: 'America/New_York',
      permissionGranted: true,
      now,
      maxOccurrences: 10,
    }
    const sched = new MemScheduler()
    await rearm(computeFireTimes(base, computeOpts), sched)

    const edited = computeFireTimes({ ...base, updatedAt: '2026-06-22T05:00:00Z' }, computeOpts)
    const res = await rearm(edited, sched)
    expect(res.scheduled).toBe(10)
    expect(res.canceled).toBe(10)
    expect((await sched.getPending()).length).toBe(10)
  })
})
