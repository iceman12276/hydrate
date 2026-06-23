'use client'

import { goalProgress, QUICK_ADD_ML, type Units } from '@hydrate/shared'
import { useRouter } from 'next/navigation'
import { useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { logIntake } from '@/app/actions'
import { Ring } from './ring'
import { Button, Input } from './ui'

export function DashboardClient({
  totalMl,
  goalMl,
}: {
  totalMl: number
  goalMl: number
  units: Units
}) {
  const router = useRouter()
  const [optimisticTotal, addOptimistic] = useOptimistic(
    totalMl,
    (cur, delta: number) => cur + delta,
  )
  const [, startTransition] = useTransition()
  const [custom, setCustom] = useState('')

  const add = (amount: number, source: 'quick_add' | 'custom' = 'quick_add') => {
    if (!Number.isFinite(amount) || amount < 1 || amount > 5000) {
      toast.error('Enter an amount between 1 and 5000 ml.')
      return
    }
    startTransition(async () => {
      addOptimistic(amount)
      const res = await logIntake(amount, source)
      if ('error' in res) toast.error(res.error)
      router.refresh()
    })
  }

  const progress = goalProgress(optimisticTotal, goalMl)

  return (
    <div className="flex flex-col items-center gap-8">
      <Ring
        ratio={progress.ratio}
        percent={progress.percent}
        totalMl={progress.totalMl}
        goalMl={goalMl}
        remainingMl={progress.remainingMl}
      />

      <div className="flex flex-wrap justify-center gap-3">
        {QUICK_ADD_ML.map((amount) => (
          <Button key={amount} variant="secondary" onClick={() => add(amount)}>
            +{amount} ml
          </Button>
        ))}
      </div>

      <form
        className="flex w-full max-w-xs items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const amount = Number(custom)
          add(amount, 'custom')
          setCustom('')
        }}
      >
        <div className="flex-1">
          <label htmlFor="custom-amount" className="sr-only">
            Custom amount in millilitres
          </label>
          <Input
            id="custom-amount"
            inputMode="numeric"
            placeholder="Custom ml"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        </div>
        <Button type="submit">Add</Button>
      </form>
    </div>
  )
}
