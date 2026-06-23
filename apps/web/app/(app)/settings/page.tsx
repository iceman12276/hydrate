import type { Units } from '@hydrate/shared'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/settings-form'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, daily_goal_ml, units, timezone')
    .eq('id', user.id)
    .single()

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm
        email={user.email ?? ''}
        profile={{
          displayName: profile?.display_name ?? '',
          dailyGoalMl: profile?.daily_goal_ml ?? 2000,
          units: (profile?.units ?? 'ml') as Units,
          timezone: profile?.timezone ?? 'UTC',
        }}
      />
    </div>
  )
}
