import type { Database } from '@hydrate/shared/supabase'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseEnv } from '../env'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/** Per-request server client with the cookie session adapter (RSC + server actions). */
export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseEnv()
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component (read-only cookies). Safe to ignore —
          // middleware refreshes the session cookie on every request.
        }
      },
    },
  })
}
