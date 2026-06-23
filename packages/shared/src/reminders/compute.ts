import { DateTime } from 'luxon'
import type { ReminderSettings } from '../schemas/reminder-settings'
import type { ComputeOptions, Occurrence } from './types'
import { hashString, inHalfOpenWindow, parseHhmm, slotCount, windowLength } from './time'

const DEFAULT_LEAD_BUFFER_SEC = 30
const DEFAULT_HORIZON_DAYS = 365
const DEFAULT_COPY = { title: 'Time to hydrate', body: 'Take a sip and log your water.' }

/** A candidate slot: a wall-clock minute-of-day attached to a local calendar day. */
interface Slot {
  day: DateTime // start-of-day in the device zone
  minute: number // 0..1439
}

/**
 * Pure, I/O-free schedule computor. Returns the next `maxOccurrences` future
 * notifications for `settings`, in the device zone, DST-correct. Returns [] when
 * disabled or permission not granted (signal to cancel everything).
 *
 * See PLAN.md §7.1. The only place offsets apply is materialize().
 */
export function computeFireTimes(settings: ReminderSettings, opts: ComputeOptions): Occurrence[] {
  if (!settings.enabled || !opts.permissionGranted) return []

  const now = DateTime.fromJSDate(opts.now, { zone: opts.zone })
  if (!now.isValid) return []

  const leadBufferSec = opts.leadBufferSec ?? DEFAULT_LEAD_BUFFER_SEC
  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS
  const cutoff = now.plus({ seconds: leadBufferSec })
  const copy = opts.copy ?? DEFAULT_COPY
  const contentHash = hashString(`${copy.title}|${copy.body}|${settings.updatedAt}`)

  const quietStartMin = settings.quietStart !== null ? parseHhmm(settings.quietStart) : null
  const quietEndMin = settings.quietEnd !== null ? parseHhmm(settings.quietEnd) : null
  const quietActive =
    quietStartMin !== null && quietEndMin !== null && quietStartMin !== quietEndMin

  const windowStartMin = parseHhmm(settings.windowStart)
  const windowEndMin = parseHhmm(settings.windowEnd)

  const occurrences: Occurrence[] = []
  const seen = new Set<string>()

  let day = now.startOf('day')
  for (let d = 0; d < horizonDays && occurrences.length < opts.maxOccurrences; d++) {
    const slots =
      settings.mode === 'interval' ? intervalSlots(settings, day) : timesSlots(settings, day)

    for (const slot of slots) {
      const dt = materialize(slot, settings.mode)
      if (dt === null) continue // spring-forward gap in interval mode -> skip

      const localMinute = dt.hour * 60 + dt.minute

      // Active-window filter — interval mode only (fixed times bypass it).
      if (
        settings.mode === 'interval' &&
        !inHalfOpenWindow(localMinute, windowStartMin, windowEndMin)
      ) {
        continue
      }
      // Quiet hours — both modes; quiet wins.
      if (
        quietActive &&
        quietStartMin !== null &&
        quietEndMin !== null &&
        inHalfOpenWindow(localMinute, quietStartMin, quietEndMin)
      ) {
        continue
      }
      // Drop the past (keep imminent-but-still-future).
      if (dt <= cutoff) continue

      const utc = dt.toUTC()
      const fireAtUtc = utc.toISO()
      const fireAtLocal = dt.toISO()
      if (fireAtUtc === null || fireAtLocal === null) continue

      const epochMinute = Math.floor(utc.toMillis() / 60000)
      const id = `${opts.userId}:${epochMinute}:${contentHash}`
      if (seen.has(id)) continue
      seen.add(id)

      occurrences.push({
        id,
        fireAtUtc,
        fireAtLocal,
        title: copy.title,
        body: copy.body,
        payload: { url: '/dashboard', tag: 'hydrate-reminder' },
      })
      if (occurrences.length >= opts.maxOccurrences) break
    }

    day = day.plus({ days: 1 })
  }

  occurrences.sort((a, b) => a.fireAtUtc.localeCompare(b.fireAtUtc))
  return occurrences.slice(0, opts.maxOccurrences)
}

/**
 * Interval grid anchored at window_start, stepping interval_minutes across the
 * (wrap-aware) window. Each slot is attributed to exactly one calendar day, so a
 * window like 20:00–02:00 produces one continuous sequence with no seam gap or
 * duplicate (PLAN.md §7.1 step 6 fix).
 */
function intervalSlots(settings: ReminderSettings, day: DateTime): Slot[] {
  const startMin = parseHhmm(settings.windowStart)
  const endMin = parseHhmm(settings.windowEnd)
  const len = windowLength(startMin, endMin)
  const count = slotCount(len, settings.intervalMinutes)

  const slots: Slot[] = []
  for (let i = 0; i < count; i++) {
    const total = startMin + i * settings.intervalMinutes
    if (total - startMin >= len) break
    const dayOffset = Math.floor(total / 1440)
    const minute = total % 1440
    slots.push({ day: day.plus({ days: dayOffset }), minute })
  }
  return slots
}

function timesSlots(settings: ReminderSettings, day: DateTime): Slot[] {
  return settings.times.map((t) => ({ day, minute: parseHhmm(t) }))
}

/**
 * Wall-clock slot -> UTC instant. Luxon auto-shifts a nonexistent (spring-forward
 * gap) wall time forward by the gap, which we detect by a changed hour/minute:
 *   - interval mode: skip the slot (return null)
 *   - fixed mode: keep the shifted, next-valid instant
 * Fall-back (ambiguous) wall times resolve to a single instant, so a slot fires
 * exactly once.
 */
function materialize(slot: Slot, mode: ReminderSettings['mode']): DateTime | null {
  const hour = Math.floor(slot.minute / 60)
  const minute = slot.minute % 60
  const dt = slot.day.set({ hour, minute, second: 0, millisecond: 0 })
  if (!dt.isValid) return null

  const shifted = dt.hour !== hour || dt.minute !== minute
  if (shifted) {
    return mode === 'interval' ? null : dt
  }
  return dt
}

/**
 * Actual buffer depth in hours = how long the armed window lasts before it
 * drains. The Reminders UI shows this and warns when it is under 24h.
 */
export function bufferDepthHours(settings: ReminderSettings, maxOccurrences: number): number {
  const perDay =
    settings.mode === 'times'
      ? settings.times.length
      : slotCount(
          windowLength(parseHhmm(settings.windowStart), parseHhmm(settings.windowEnd)),
          settings.intervalMinutes,
        )
  if (perDay <= 0) return 0
  return (maxOccurrences / perDay) * 24
}

/**
 * The HH:mm list a platform should arm as native repeating (daily) triggers for
 * fixed `times` mode — quiet-hour times removed (quiet wins). Empty for interval
 * mode (which uses one-shot grids from computeFireTimes instead).
 */
export function fixedTimesForRepeating(settings: ReminderSettings): string[] {
  if (settings.mode !== 'times' || !settings.enabled) return []
  const quietStartMin = settings.quietStart !== null ? parseHhmm(settings.quietStart) : null
  const quietEndMin = settings.quietEnd !== null ? parseHhmm(settings.quietEnd) : null
  const quietActive =
    quietStartMin !== null && quietEndMin !== null && quietStartMin !== quietEndMin
  if (!quietActive || quietStartMin === null || quietEndMin === null) return [...settings.times]
  return settings.times.filter((t) => !inHalfOpenWindow(parseHhmm(t), quietStartMin, quietEndMin))
}
