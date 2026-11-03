import type { CookieOptions } from '@supabase/ssr';

/**
 * Cookie attributes for the Supabase auth session.
 *
 * GymOS is served inside a cross-site iframe in hosted preview environments.
 * Browsers refuse to send `SameSite=Lax` cookies on cross-site iframe requests,
 * so the session cookie written by the browser client is never returned to the
 * server. Middleware then sees an anonymous request and redirects straight back
 * to `/login` -- the sign-in appears to do nothing.
 *
 * `SameSite=None` fixes that, but browsers only accept it when `Secure` is also
 * set, and `Secure` cookies are rejected over plain http://localhost. So the
 * pairing is chosen per environment:
 *
 *   - HTTPS (preview + production): SameSite=None; Secure  -> works in iframes.
 *   - Plain HTTP local dev:         SameSite=Lax           -> works on localhost.
 *
 * Both branches keep the cookie scoped to the origin; this never widens access,
 * and PostgreSQL RLS remains the authoritative data boundary regardless.
 */
export function getAuthCookieOptions(isSecureRequest: boolean): CookieOptions {
  if (isSecureRequest) {
    return { path: '/', sameSite: 'none', secure: true };
  }

  return { path: '/', sameSite: 'lax', secure: false };
}

/** Detects HTTPS, honouring the `x-forwarded-proto` header set by preview proxies. */
export function isSecureRequest(headers: {
  get(name: string): string | null;
}, requestUrl: string): boolean {
  const forwardedProto = headers.get('x-forwarded-proto');

  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim() === 'https';
  }

  return requestUrl.startsWith('https://');
}
