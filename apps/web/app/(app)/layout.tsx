import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { InTabReminders } from '@/components/in-tab-reminders'
import { Nav } from '@/components/nav'
import { mapReminderRow } from '@/lib/map-reminder-row'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: row } = await supabase
    .from('reminder_settings')
    .select(
      'enabled, mode, interval_minutes, times, window_start, window_end, quiet_start, quiet_end, updated_at',
    )
    .eq('user_id', user.id)
    .single()

  return (
    <div className="md:flex">
      <Nav />
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 md:pb-10">{children}</main>
      <InTabReminders userId={user.id} settings={mapReminderRow(row)} />
    </div>
  )
}
