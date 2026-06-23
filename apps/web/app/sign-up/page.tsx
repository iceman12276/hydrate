import Link from 'next/link'
import { Suspense } from 'react'
import { AuthForm } from '@/components/auth-form'
import { Card } from '@/components/ui'

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Card>
        <h1 className="mb-1 text-2xl font-semibold">Create your account</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Start tracking your water.
        </p>
        <Suspense>
          <AuthForm mode="sign-up" />
        </Suspense>
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-sky-600 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  )
}
