import type { Database } from '@hydrate/shared/supabase'
import { createBrowserClient } from '@supabase/ssr'
import { supabaseEnv } from '../env'

/** Browser client for client components (TanStack Query mutations, auth UI). */
export function createClient() {
  const { url, anonKey } = supabaseEnv()
  return createBrowserClient<Database>(url, anonKey)
}
