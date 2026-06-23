'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { deleteIntake } from '@/app/actions'

export function DeleteEntryButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      aria-label="Delete entry"
      disabled={pending}
      className="rounded p-1 text-slate-400 transition hover:text-red-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      onClick={() =>
        startTransition(async () => {
          const res = await deleteIntake(id)
          if ('error' in res) toast.error(res.error)
          router.refresh()
        })
      }
    >
      <Trash2 size={16} aria-hidden="true" />
    </button>
  )
}
