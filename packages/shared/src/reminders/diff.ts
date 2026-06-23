import type { NotificationScheduler, Occurrence, PendingNotification, ScheduleDiff } from './types'

/**
 * Idempotent diff: given the desired occurrences and what the OS currently has
 * pending, return what to schedule and what to cancel. Deterministic ids mean a
 * re-run with unchanged settings yields empty sets (a no-op, never a double-alert).
 */
export function diffSchedule(desired: Occurrence[], pending: PendingNotification[]): ScheduleDiff {
  const desiredIds = new Set(desired.map((o) => o.id))
  const pendingIds = new Set(pending.map((p) => p.id))
  return {
    toSchedule: desired.filter((o) => !pendingIds.has(o.id)),
    toCancel: pending.filter((p) => !desiredIds.has(p.id)).map((p) => p.id),
  }
}

/**
 * Platform-agnostic re-arm: read pending -> diff against desired -> cancel stale
 * -> schedule missing. `desired` is the output of computeFireTimes (or [] to
 * cancel everything). Drives an injected NotificationScheduler port.
 */
export async function rearm(
  desired: Occurrence[],
  scheduler: NotificationScheduler,
): Promise<{ scheduled: number; canceled: number }> {
  const pending = await scheduler.getPending()
  const { toSchedule, toCancel } = diffSchedule(desired, pending)
  if (toCancel.length > 0) await scheduler.cancel(toCancel)
  for (const occurrence of toSchedule) {
    await scheduler.schedule(occurrence)
  }
  return { scheduled: toSchedule.length, canceled: toCancel.length }
}
