'use client'

import { bufferDepthHours, type ReminderSettings } from '@hydrate/shared'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { saveReminderSettings } from '@/app/actions'
import { Button, Card, Input, Label } from './ui'

type FormState = Omit<ReminderSettings, 'updatedAt'>

// Representative pending cap (iOS-like) for the buffer-depth estimate.
const REFERENCE_N = 60

export function RemindersForm({ initial }: { initial: FormState }) {
  const [s, setS] = useState<FormState>(initial)
  const [quietOn, setQuietOn] = useState(initial.quietStart !== null)
  const [pending, setPending] = useState(false)
  const set = (patch: Partial<FormState>) => setS((cur) => ({ ...cur, ...patch }))

  const bufferH = Math.round(bufferDepthHours({ ...s, updatedAt: '' }, REFERENCE_N))
  const lowBuffer = s.enabled && bufferH < 24

  const save = async () => {
    setPending(true)
    const res = await saveReminderSettings({
      ...s,
      quietStart: quietOn ? s.quietStart : null,
      quietEnd: quietOn ? s.quietEnd : null,
    })
    setPending(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success('Reminders saved.')
  }

  const sendTest = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('This browser does not support notifications.')
      return
    }
    let perm = Notification.permission
    if (perm === 'default') perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      toast.error('Notification permission was not granted.')
      return
    }
    new Notification('Hydrate', { body: 'Time to drink some water 💧' })
  }

  return (
    <div className="space-y-6">
      <div
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        Reminders only fire while Hydrate is open in a browser tab. Install the mobile or desktop
        app for reminders that work in the background.
      </div>

      <Card className="space-y-5">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="font-medium">Enable reminders</span>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Mode</legend>
          <div className="flex gap-4">
            {(['interval', 'times'] as const).map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={s.mode === m}
                  onChange={() => set({ mode: m })}
                />
                <span>{m === 'interval' ? 'Every N minutes' : 'Fixed times'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {s.mode === 'interval' ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="interval">Interval (minutes, 15–1440)</Label>
              <Input
                id="interval"
                type="number"
                min={15}
                max={1440}
                value={s.intervalMinutes}
                onChange={(e) => set({ intervalMinutes: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="windowStart">Active from</Label>
              <Input
                id="windowStart"
                type="time"
                value={s.windowStart}
                onChange={(e) => set({ windowStart: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="windowEnd">Active until</Label>
              <Input
                id="windowEnd"
                type="time"
                value={s.windowEnd}
                onChange={(e) => set({ windowEnd: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Times</Label>
            {s.times.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="time"
                  value={t}
                  aria-label={`Reminder time ${i + 1}`}
                  onChange={(e) =>
                    set({ times: s.times.map((x, j) => (j === i ? e.target.value : x)) })
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove time ${i + 1}`}
                  className="rounded p-2 text-slate-400 hover:text-red-600"
                  onClick={() => set({ times: s.times.filter((_, j) => j !== i) })}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => set({ times: [...s.times, '09:00'] })}
            >
              <Plus size={16} aria-hidden="true" /> Add time
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={quietOn}
              onChange={(e) => {
                setQuietOn(e.target.checked)
                if (e.target.checked && (s.quietStart === null || s.quietEnd === null)) {
                  set({ quietStart: '22:00', quietEnd: '07:00' })
                }
              }}
              className="h-4 w-4"
            />
            <span className="font-medium">Quiet hours</span>
          </label>
          {quietOn && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quietStart">From</Label>
                <Input
                  id="quietStart"
                  type="time"
                  value={s.quietStart ?? '22:00'}
                  onChange={(e) => set({ quietStart: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="quietEnd">Until</Label>
                <Input
                  id="quietEnd"
                  type="time"
                  value={s.quietEnd ?? '07:00'}
                  onChange={(e) => set({ quietEnd: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        <p
          className={`text-sm ${lowBuffer ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}
        >
          Buffer depth ≈ {bufferH} h{' '}
          {lowBuffer && '— under a day; open the app daily to keep reminders scheduled.'}
        </p>

        <div className="flex gap-3">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save reminders'}
          </Button>
          <Button type="button" variant="secondary" onClick={sendTest}>
            Send test
          </Button>
        </div>
      </Card>
    </div>
  )
}
