'use client'

import { Bell, Droplet, History, LogOut, Settings as SettingsIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/actions'
import { cx } from './ui'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: Droplet },
  { href: '/history', label: 'History', icon: History },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
]

export function Nav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 md:static md:h-screen md:w-56 md:flex-col md:justify-start md:gap-1 md:border-r md:border-t-0 md:p-4"
    >
      <span className="hidden px-2 pb-4 text-lg font-bold md:block">Hydrate 💧</span>
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition md:flex-row md:gap-3 md:text-sm',
              active
                ? 'text-sky-600 md:bg-sky-50 dark:md:bg-sky-950/40'
                : 'text-slate-500 hover:text-slate-900 md:hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:md:hover:bg-slate-800',
            )}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        )
      })}
      <form action={signOut} className="mt-auto hidden md:block">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <LogOut size={18} aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </form>
    </nav>
  )
}
