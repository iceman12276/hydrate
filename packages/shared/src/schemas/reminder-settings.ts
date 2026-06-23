import { z } from 'zod'

/** Wall-clock time of day, 'HH:mm' (matches a Postgres `time` truncated to minutes). */
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm (00:00–23:59)')

export const reminderModeSchema = z.enum(['interval', 'times'])
export type ReminderMode = z.infer<typeof reminderModeSchema>

/**
 * The synced schedule every client reads to arm its own local notifications.
 * Bounds and CHECKs mirror the SQL migration exactly so validation rejects the
 * same edges client-side (see reminder-settings.test.ts).
 */
export const reminderSettingsSchema = z
  .object({
    enabled: z.boolean(),
    mode: reminderModeSchema,
    // interval mode: every N minutes (15 min .. 24 h)
    intervalMinutes: z.number().int().min(15).max(1440),
    // times mode: explicit wall-clock times
    times: z.array(hhmm),
    // active window (interval mode only); half-open [start, end), wrap-aware
    windowStart: hhmm,
    windowEnd: hhmm,
    // quiet hours (both modes); both set or both null
    quietStart: hhmm.nullable(),
    quietEnd: hhmm.nullable(),
    // the re-arm sync token (a timestamptz, compared as a string)
    updatedAt: z.string().min(1),
  })
  .refine((s) => s.windowStart !== s.windowEnd, {
    message: 'window_start and window_end must differ',
    path: ['windowEnd'],
  })
  .refine((s) => (s.quietStart === null) === (s.quietEnd === null), {
    message: 'quiet hours must be both set or both null',
    path: ['quietEnd'],
  })
  // The equal-quiet bug: (t >= q AND t < q) is always-true wrap-aware, which
  // would silently suppress every reminder. Forbid equal bounds.
  .refine((s) => s.quietStart === null || s.quietStart !== s.quietEnd, {
    message: 'quiet_start and quiet_end must differ',
    path: ['quietEnd'],
  })
  .refine((s) => s.mode !== 'times' || s.times.length > 0, {
    message: 'times mode requires at least one time',
    path: ['times'],
  })

export type ReminderSettings = z.infer<typeof reminderSettingsSchema>

/** A self-consistent default row (matches handle_new_user()'s insert). */
export const defaultReminderSettings = (updatedAt: string): ReminderSettings => ({
  enabled: false,
  mode: 'interval',
  intervalMinutes: 60,
  times: [],
  windowStart: '08:00',
  windowEnd: '22:00',
  quietStart: null,
  quietEnd: null,
  updatedAt,
})
