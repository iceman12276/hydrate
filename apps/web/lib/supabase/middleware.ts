import type { Database } from '@hydrate/shared/supabase'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseEnv } from '../env'

type CookieToSet = { name: string; value: string; options: CookieOptions }

const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/auth']

function isPublic(path: string): boolean {
  if (path === '/') return true
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))
}

/**
 * Runs on every non-static request: build a server client bound to this
 * request's cookies, revalidate the JWT with getUser(), guard protected routes,
 * and return the SAME response carrying any rotated cookies.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const { url, anonKey } = supabaseEnv()

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Revalidate the JWT against the Auth server before any authorization decision.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  if (!user && !isPublic(path)) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/sign-in'
    redirect.searchParams.set('next', path)
    return NextResponse.redirect(redirect)
  }

  if (user && (path === '/sign-in' || path === '/sign-up')) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/dashboard'
    redirect.search = ''
    return NextResponse.redirect(redirect)
  }

  return response
}
