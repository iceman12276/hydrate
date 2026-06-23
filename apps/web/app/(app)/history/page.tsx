import { average, bucketByLocalDay, computeStreak, lastNDays } from '@hydrate/shared'
import { DateTime } from 'luxon'
import { redirect } from 'next/navigation'
import { Card } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function HistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('daily_goal_ml, timezone')
    .eq('id', user.id)
    .single()

  const tz = profile?.timezone ?? 'UTC'
  const goalMl = profile?.daily_goal_ml ?? 2000

  const now = DateTime.now().setZone(tz)
  const todayKey = now.toFormat('yyyy-MM-dd')
  const startUtc = now.startOf('day').minus({ days: 29 }).toUTC().toISO() ?? undefined

  const { data: entries } = await supabase
    .from('intake_entries')
    .select('amount_ml, logged_at')
    .gte('logged_at', startUtc ?? '1970-01-01T00:00:00Z')

  const buckets = bucketByLocalDay(
    (entries ?? []).map((e) => ({ loggedAt: e.logged_at, amountMl: e.amount_ml })),
    tz,
  )
  const days30 = lastNDays(buckets, todayKey, 30, goalMl, tz)
  const days7 = days30.slice(-7)
  const streak = computeStreak(buckets, todayKey, goalMl, tz)
  const avg = Math.round(average(days30.map((d) => d.totalMl)))
  const total = days30.reduce((s, d) => s + d.totalMl, 0)
  const maxBar = Math.max(goalMl, ...days7.map((d) => d.totalMl), 1)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">History</h1>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Streak" value={`${streak}d`} />
        <Stat label="30-day avg" value={`${avg} ml`} />
        <Stat label="30-day total" value={`${(total / 1000).toFixed(1)} L`} />
      </div>

      <Card>
        <h2 className="mb-4 text-sm font-medium text-slate-500 dark:text-slate-400">Last 7 days</h2>
        <div
          className="flex h-44 items-end gap-2"
          role="list"
          aria-label="Daily intake, last 7 days"
        >
          {days7.map((d) => {
            const heightPct = Math.round((d.totalMl / maxBar) * 100)
            const label = DateTime.fromISO(d.date).toFormat('ccc')
            return (
              <div
                key={d.date}
                role="listitem"
                aria-label={`${DateTime.fromISO(d.date).toFormat('cccc d LLL')}: ${d.totalMl} ml${d.metGoal ? ', goal met' : ''}`}
                className="flex flex-1 flex-col items-center justify-end gap-1"
              >
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t ${d.metGoal ? 'bg-sky-500' : 'bg-sky-200 dark:bg-sky-900'}`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400">{label}</span>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">Goal line: {goalMl} ml/day</p>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </Card>
  )
}
