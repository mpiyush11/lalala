'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/types/database';

import { getAuthCookieOptions } from './cookie-options';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

function getSupabaseEnvironment(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  return { url, anonKey };
}

/**
 * Returns one typed Supabase browser client per browser runtime.
 * Authorization is always enforced by PostgreSQL RLS; this client never uses a
 * service-role credential.
 */
export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, anonKey } = getSupabaseEnvironment();

  // Over HTTPS the session cookie must be SameSite=None so it survives the
  // cross-site iframe used by hosted previews; otherwise the browser withholds
  // it and middleware bounces every sign-in back to /login. Plain-HTTP
  // localhost cannot use Secure cookies, so it falls back to Lax.
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:';

  browserClient = createBrowserClient<Database>(url, anonKey, {
    cookieOptions: getAuthCookieOptions(secure),
  });

  return browserClient;
}
