import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold">Hydrate 💧</h1>
      <p className="text-slate-500 dark:text-slate-400">
        Track your water and get gentle, on-device reminders — on web, mobile, and desktop.
      </p>
      <div className="flex gap-3">
        <Link href="/sign-up">
          <Button>Get started</Button>
        </Link>
        <Link href="/sign-in">
          <Button variant="secondary">Sign in</Button>
        </Link>
      </div>
    </main>
  )
}
