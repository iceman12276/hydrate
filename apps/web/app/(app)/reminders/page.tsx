import type { ReminderMode } from '@hydrate/shared'
import { redirect } from 'next/navigation'
import { RemindersForm } from '@/components/reminders-form'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Postgres `time` comes back as 'HH:mm:ss'; the form/schema use 'HH:mm'.
function toHm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

export default async function RemindersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: row } = await supabase
    .from('reminder_settings')
    .select(
      'enabled, mode, interval_minutes, times, window_start, window_end, quiet_start, quiet_end',
    )
    .eq('user_id', user.id)
    .single()

  const initial = {
    enabled: row?.enabled ?? false,
    mode: (row?.mode ?? 'interval') as ReminderMode,
    intervalMinutes: row?.interval_minutes ?? 60,
    times: (row?.times ?? []).map((t) => t.slice(0, 5)),
    windowStart: toHm(row?.window_start ?? null) ?? '08:00',
    windowEnd: toHm(row?.window_end ?? null) ?? '22:00',
    quietStart: toHm(row?.quiet_start ?? null),
    quietEnd: toHm(row?.quiet_end ?? null),
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Reminders</h1>
      <RemindersForm initial={initial} />
    </div>
  )
}
