'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import type { Units } from '@hydrate/shared'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { signOut, updateProfile } from '@/app/actions'
import { Button, Card, FieldError, Input, Label } from './ui'

const schema = z.object({
  displayName: z.string().trim().max(80).optional(),
  dailyGoalMl: z.coerce.number().int().min(250, 'Min 250 ml').max(20000, 'Max 20000 ml'),
  units: z.enum(['ml', 'oz']),
  timezone: z.string().min(1, 'Required'),
})
type Values = z.infer<typeof schema>

interface Props {
  email: string
  profile: { displayName: string; dailyGoalMl: number; units: Units; timezone: string }
}

export function SettingsForm({ email, profile }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: profile.displayName,
      dailyGoalMl: profile.dailyGoalMl,
      units: profile.units,
      timezone: profile.timezone,
    },
  })

  const onSubmit = async (v: Values) => {
    setPending(true)
    const res = await updateProfile({
      displayName: v.displayName || null,
      dailyGoalMl: v.dailyGoalMl,
      units: v.units,
      timezone: v.timezone,
    })
    setPending(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success('Settings saved.')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled readOnly />
          </div>
          <div>
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" {...register('displayName')} />
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
          <div>
            <Label htmlFor="timezone">Timezone (for daily totals)</Label>
            <div className="flex gap-2">
              <Input id="timezone" {...register('timezone')} />
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setValue('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
                }
              >
                Detect
              </Button>
            </div>
            <FieldError>{errors.timezone?.message}</FieldError>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </div>
  )
}
