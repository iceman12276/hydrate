'use server'

import { profileSchema, reminderSettingsSchema } from '@hydrate/shared'
import type { TablesUpdate } from '@hydrate/shared/supabase'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

type ActionResult = { ok: true } | { error: string }

const amountSchema = z.number().int().min(1).max(5000)
const sourceSchema = z.enum(['quick_add', 'custom', 'manual'])

export async function logIntake(amountMl: number, source = 'quick_add'): Promise<ActionResult> {
  const amount = amountSchema.safeParse(amountMl)
  if (!amount.success) return { error: 'Amount must be between 1 and 5000 ml.' }
  const src = sourceSchema.safeParse(source)
  if (!src.success) return { error: 'Invalid source.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase
    .from('intake_entries')
    .insert({ user_id: user.id, amount_ml: amount.data, source: src.data })
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/history')
  return { ok: true }
}

export async function deleteIntake(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase.from('intake_entries').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/history')
  return { ok: true }
}

export async function updateProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.partial().safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid profile.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const patch: TablesUpdate<'profiles'> = {}
  if (parsed.data.displayName !== undefined) patch.display_name = parsed.data.displayName
  if (parsed.data.dailyGoalMl !== undefined) patch.daily_goal_ml = parsed.data.dailyGoalMl
  if (parsed.data.units !== undefined) patch.units = parsed.data.units
  if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/settings')
  return { ok: true }
}

export async function saveReminderSettings(input: unknown): Promise<ActionResult> {
  // updatedAt is server-managed (the BEFORE UPDATE trigger sets it); inject a
  // placeholder so the shared schema's refinements still run on the rest.
  const candidate =
    input && typeof input === 'object'
      ? { ...(input as Record<string, unknown>), updatedAt: '2026-01-01T00:00:00Z' }
      : input
  const parsed = reminderSettingsSchema.safeParse(candidate)
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Invalid reminder settings.' }
  const s = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { error } = await supabase
    .from('reminder_settings')
    .update({
      enabled: s.enabled,
      mode: s.mode,
      interval_minutes: s.intervalMinutes,
      times: s.times,
      window_start: s.windowStart,
      window_end: s.windowEnd,
      quiet_start: s.quietStart,
      quiet_end: s.quietEnd,
    })
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/reminders')
  return { ok: true }
}

export async function signOut(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
