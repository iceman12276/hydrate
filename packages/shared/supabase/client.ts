import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import type { Database } from './types'

export type HydrateClient = SupabaseClient<Database>

export interface ClientConfig {
  /** Public project URL (NEXT_PUBLIC_/EXPO_PUBLIC_). */
  url: string
  /** Publishable / anon key only — the service-role key never reaches a client. */
  anonKey: string
  /** Platform session-storage adapter: cookies (web), secure-store (RN), keychain (desktop). */
  storage?: SupportedStorage
  flowType?: 'pkce' | 'implicit'
  persistSession?: boolean
  autoRefreshToken?: boolean
  detectSessionInUrl?: boolean
}

/**
 * Builds a typed Supabase client. packages/shared never reads process.env — each
 * app injects resolved public config plus its own storage adapter, so the same
 * factory serves web, mobile, and desktop. RLS scopes every row to the owner.
 */
export function createHydrateClient(config: ClientConfig): HydrateClient {
  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      flowType: config.flowType ?? 'pkce',
      persistSession: config.persistSession ?? true,
      autoRefreshToken: config.autoRefreshToken ?? true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
      ...(config.storage ? { storage: config.storage } : {}),
    },
  })
}
