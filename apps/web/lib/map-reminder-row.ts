import type { ReminderMode, ReminderSettings } from '@hydrate/shared'

interface ReminderRow {
  enabled: boolean
  mode: string
  interval_minutes: number
  times: string[]
  window_start: string
  window_end: string
  quiet_start: string | null
  quiet_end: string | null
  updated_at: string
}

const hm = (t: string | null): string | null => (t ? t.slice(0, 5) : null)

/** Map a reminder_settings DB row (snake_case, 'HH:mm:ss') to the shared type. */
export function mapReminderRow(row: ReminderRow | null): ReminderSettings {
  return {
    enabled: row?.enabled ?? false,
    mode: (row?.mode ?? 'interval') as ReminderMode,
    intervalMinutes: row?.interval_minutes ?? 60,
    times: (row?.times ?? []).map((t) => t.slice(0, 5)),
    windowStart: hm(row?.window_start ?? null) ?? '08:00',
    windowEnd: hm(row?.window_end ?? null) ?? '22:00',
    quietStart: hm(row?.quiet_start ?? null),
    quietEnd: hm(row?.quiet_end ?? null),
    updatedAt: row?.updated_at ?? '',
  }
}
