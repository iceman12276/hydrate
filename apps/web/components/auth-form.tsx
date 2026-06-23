'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { safeNext } from '@/lib/safe-next'
import { createClient } from '@/lib/supabase/client'
import { Button, FieldError, Input, Label } from './ui'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
})
type Values = z.infer<typeof schema>

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const [supabase] = useState(() => createClient())
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeNext(searchParams.get('next'))
  const [pending, setPending] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: Values) => {
    setPending(true)
    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword(values)
      if (error) {
        toast.error(error.message)
        setPending(false)
        return
      }
      router.push(nextPath)
      router.refresh()
      return
    }

    const { data, error } = await supabase.auth.signUp({
      ...values,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding` },
    })
    if (error) {
      toast.error(error.message)
      setPending(false)
      return
    }
    if (data.session) {
      router.push('/onboarding')
      router.refresh()
    } else {
      toast.success('Check your email to confirm your account.')
      setPending(false)
    }
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        <FieldError>{errors.email?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          {...register('password')}
        />
        <FieldError>{errors.password?.message}</FieldError>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </Button>
      <Button type="button" variant="secondary" className="w-full" onClick={signInWithGoogle}>
        Continue with Google
      </Button>
    </form>
  )
}
