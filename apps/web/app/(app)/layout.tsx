import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Nav } from '@/components/nav'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  return (
    <div className="md:flex">
      <Nav />
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 md:pb-10">{children}</main>
    </div>
  )
}
