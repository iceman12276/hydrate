import { z } from 'zod'

export const intakeSourceSchema = z.enum(['quick_add', 'custom', 'manual'])
export type IntakeSource = z.infer<typeof intakeSourceSchema>

/**
 * An append-only ml log entry. `amount_ml` 1..5000 mirrors the SQL CHECK.
 * The `logged_at <= now()+5min` rule is enforced server-side (it needs the
 * server clock); a client may pass a value to validate optimistically.
 */
export const intakeEntrySchema = z.object({
  amountMl: z.number().int().min(1).max(5000),
  loggedAt: z.string().min(1),
  source: intakeSourceSchema,
})

export type IntakeEntry = z.infer<typeof intakeEntrySchema>

/** Quick-add buttons on every dashboard. */
export const QUICK_ADD_ML = [250, 500, 750] as const
