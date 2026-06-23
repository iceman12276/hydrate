import type { Units } from '@hydrate/shared'
import { DateTime } from 'luxon'
import { redirect } from 'next/navigation'
import { DashboardClient } from '@/components/dashboard-client'
import { DeleteEntryButton } from '@/components/delete-button'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('daily_goal_ml, units, timezone')
    .eq('id', user.id)
    .single()

  const tz = profile?.timezone ?? 'UTC'
  const goalMl = profile?.daily_goal_ml ?? 2000
  const units = (profile?.units ?? 'ml') as Units

  // Today's entries = everything since local midnight (tz-correct UTC bound).
  const startOfTodayUtc = DateTime.now().setZone(tz).startOf('day').toUTC().toISO() ?? undefined
  const { data: entries } = await supabase
    .from('intake_entries')
    .select('id, amount_ml, logged_at, source')
    .gte('logged_at', startOfTodayUtc ?? '1970-01-01T00:00:00Z')
    .order('logged_at', { ascending: false })

  const list = entries ?? []
  const totalMl = list.reduce((sum, e) => sum + e.amount_ml, 0)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Today</h1>

      <DashboardClient totalMl={totalMl} goalMl={goalMl} units={units} />

      <section aria-labelledby="recent-heading">
        <h2
          id="recent-heading"
          className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400"
        >
          Recent
        </h2>
        {list.length === 0 ? (
          <p className="text-sm text-slate-400">No water logged yet today.</p>
        ) : (
          <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
            {list.map((e) => (
              <div key={e.id} className="flex items-center gap-4 px-4 py-3">
                <span className="flex-1 tabular-nums">{e.amount_ml} ml</span>
                <span className="text-sm text-slate-400">
                  {DateTime.fromISO(e.logged_at).setZone(tz).toFormat('h:mm a')}
                </span>
                <DeleteEntryButton id={e.id} />
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  )
}
