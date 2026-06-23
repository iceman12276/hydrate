import Link from 'next/link'
import { Suspense } from 'react'
import { AuthForm } from '@/components/auth-form'
import { Card } from '@/components/ui'

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Card>
        <h1 className="mb-1 text-2xl font-semibold">Welcome back</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Sign in to Hydrate.</p>
        <Suspense>
          <AuthForm mode="sign-in" />
        </Suspense>
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          No account?{' '}
          <Link href="/sign-up" className="font-medium text-sky-600 hover:underline">
            Sign up
          </Link>
        </p>
      </Card>
    </main>
  )
}
