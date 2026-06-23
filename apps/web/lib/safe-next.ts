/**
 * Only allow same-origin local redirect targets, defeating open-redirect via a
 * crafted `?next=`. Must start with a single '/', and not be a protocol-relative
 * '//host' or a backslash-smuggled '/\\host'.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/dashboard'
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) return raw
  return '/dashboard'
}
