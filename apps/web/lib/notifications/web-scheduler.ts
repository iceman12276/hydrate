import type { NotificationScheduler, Occurrence } from '@hydrate/shared'

// setTimeout delays are a signed 32-bit int (~24.8 days).
const MAX_DELAY = 2_147_483_647

/**
 * Best-effort in-tab scheduler: arms a setTimeout per occurrence while the tab is
 * open. Implements the shared NotificationScheduler port, so the same `rearm`
 * drives it. Cross-tab duplicates collapse because each notification uses the
 * deterministic occurrence id as its `tag` (a same-tag notification replaces the
 * prior one). Cannot fire when the tab/browser is closed — see the on-screen
 * banner.
 */
export function createWebScheduler(): NotificationScheduler & { dispose(): void } {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  return {
    async getPending() {
      return [...timers.keys()].map((id) => ({ id }))
    },
    async schedule(o: Occurrence) {
      const delay = new Date(o.fireAtUtc).getTime() - Date.now()
      if (delay < 0 || delay > MAX_DELAY) return
      const timer = setTimeout(() => {
        timers.delete(o.id)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(o.title, { body: o.body, tag: o.id })
        }
      }, delay)
      timers.set(o.id, timer)
    },
    async cancel(ids: string[]) {
      for (const id of ids) {
        const timer = timers.get(id)
        if (timer) clearTimeout(timer)
        timers.delete(id)
      }
    },
    async cancelAll() {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }
}
