'use client'

import { computeFireTimes, rearm, type ReminderSettings } from '@hydrate/shared'
import { useEffect } from 'react'
import { createWebScheduler } from '@/lib/notifications/web-scheduler'

/**
 * Mounts in the app shell and arms in-tab notification timers from the shared
 * computor while the tab is open. Re-arms on focus/visibility and every minute
 * (idempotent diff). No UI. Background firing needs the mobile/desktop app — the
 * Reminders screen says so.
 */
export function InTabReminders({
  userId,
  settings,
}: {
  userId: string
  settings: ReminderSettings
}) {
  useEffect(() => {
    if (!settings.enabled) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    const scheduler = createWebScheduler()
    const arm = () => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const desired = computeFireTimes(settings, {
        userId,
        zone,
        permissionGranted: true,
        now: new Date(),
        maxOccurrences: 8,
        horizonDays: 2,
      })
      void rearm(desired, scheduler)
    }

    arm()
    const onVisible = () => {
      if (document.visibilityState === 'visible') arm()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', arm)
    const ticker = setInterval(arm, 60_000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', arm)
      clearInterval(ticker)
      scheduler.dispose()
    }
  }, [userId, settings])

  return null
}
