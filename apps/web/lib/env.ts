import { z } from 'zod'

const schema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(1),
})

let cached: z.infer<typeof schema> | null = null

/**
 * Public Supabase config, validated on first use (fail-fast). Lazy so a build
 * without env (e.g. CI) doesn't fail unless a statically-rendered page reads it
 * — and our authed pages are dynamic, so none do.
 */
export function supabaseEnv() {
  if (cached) return cached
  cached = schema.parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  return cached
}
