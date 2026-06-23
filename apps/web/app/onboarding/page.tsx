'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { updateProfile } from '@/app/actions'
import { Button, Card, FieldError, Input, Label } from '@/components/ui'

const schema = z.object({
  displayName: z.string().trim().max(80).optional(),
  dailyGoalMl: z.coerce.number().int().min(250, 'Min 250 ml').max(20000, 'Max 20000 ml'),
  units: z.enum(['ml', 'oz']),
})
type Values = z.infer<typeof schema>

export default function OnboardingPage() {
  const router = useRouter()
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [pending, setPending] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { dailyGoalMl: 2000, units: 'ml' },
  })

  const onSubmit = async (v: Values) => {
    setPending(true)
    const res = await updateProfile({
      displayName: v.displayName || null,
      dailyGoalMl: v.dailyGoalMl,
      units: v.units,
      timezone: tz,
    })
    if ('error' in res) {
      toast.error(res.error)
      setPending(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <Card>
        <h1 className="mb-1 text-2xl font-semibold">Welcome to Hydrate</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Set up your daily goal.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="displayName">Name (optional)</Label>
            <Input id="displayName" autoComplete="name" {...register('displayName')} />
            <FieldError>{errors.displayName?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="dailyGoalMl">Daily goal (ml)</Label>
            <Input
              id="dailyGoalMl"
              type="number"
              inputMode="numeric"
              {...register('dailyGoalMl')}
            />
            <FieldError>{errors.dailyGoalMl?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="units">Units</Label>
            <select
              id="units"
              {...register('units')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="ml">Millilitres (ml)</option>
              <option value="oz">Fluid ounces (oz)</option>
            </select>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Detected timezone: <strong>{tz}</strong>
          </p>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Saving…' : 'Get started'}
          </Button>
        </form>
      </Card>
    </main>
  )
}
