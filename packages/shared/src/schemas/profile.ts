import { z } from 'zod'

export const unitsSchema = z.enum(['ml', 'oz'])
export type Units = z.infer<typeof unitsSchema>

/** True if `tz` is a zone the host's Intl implementation accepts. */
export function isValidIanaZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const profileSchema = z.object({
  dailyGoalMl: z.number().int().min(250).max(20000),
  units: unitsSchema,
  displayName: z.string().trim().max(80).nullable(),
  timezone: z.string().refine(isValidIanaZone, { message: 'not a valid IANA timezone' }),
})

export type Profile = z.infer<typeof profileSchema>
