import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getAuthCookieOptions, isSecureRequest } from '@/lib/supabase/cookie-options';
import type { Database } from '@/lib/types/database';
import type { UserRole } from '@/lib/types';

const LOGIN_ROUTE = '/login';
const PUBLIC_ROUTE_PREFIXES = ['/verify-receipt'] as const;
const USER_ROLES = new Set<UserRole>(['receptionist', 'owner', 'superadmin', 'trainer']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthContext = {
  role: UserRole;
  tenantId: string;
};

type PendingCookie = {
  name: string;
  value: string;
  options?: CookieOptions;
};

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

function parseAuthContext(appMetadata: Record<string, unknown>): AuthContext | null {
  const tenantId = appMetadata.tenant_id;
  const role = appMetadata.role;

  if (
    typeof tenantId !== 'string' ||
    !UUID_PATTERN.test(tenantId) ||
    typeof role !== 'string' ||
    !USER_ROLES.has(role as UserRole)
  ) {
    return null;
  }

  return { tenantId, role: role as UserRole };
}

function isRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function applyRefreshedCookies(
  cookies: PendingCookie[],
  target: NextResponse,
  overrides?: CookieOptions,
): NextResponse {
  cookies.forEach(({ name, value, options }) => {
    target.cookies.set(name, value, { ...options, ...overrides });
  });

  return target;
}

function redirectToLogin(
  request: NextRequest,
  refreshedCookies: PendingCookie[],
  cookieOverrides: CookieOptions,
  reason?: 'invalid_claims',
): NextResponse {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';

  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('next', requestedPath);

  if (reason) {
    loginUrl.searchParams.set('auth_error', reason);
  }

  return applyRefreshedCookies(
    refreshedCookies,
    NextResponse.redirect(loginUrl, { status: 307 }),
    cookieOverrides,
  );
}

function redirectAuthenticatedUser(
  request: NextRequest,
  refreshedCookies: PendingCookie[],
  cookieOverrides: CookieOptions,
  role: UserRole,
): NextResponse {
  const destination = request.nextUrl.clone();
  destination.pathname =
    role === 'superadmin' ? '/superadmin' : role === 'owner' ? '/owner/dashboard' : '/dashboard';
  destination.search = '';

  return applyRefreshedCookies(
    refreshedCookies,
    NextResponse.redirect(destination, { status: 307 }),
    cookieOverrides,
  );
}

function redirectForbidden(
  request: NextRequest,
  refreshedCookies: PendingCookie[],
  cookieOverrides: CookieOptions,
): NextResponse {
  const dashboardUrl = request.nextUrl.clone();
  dashboardUrl.pathname = '/dashboard';
  dashboardUrl.search = '';
  dashboardUrl.searchParams.set('auth_error', 'forbidden');
  dashboardUrl.searchParams.set('status', '403');

  const response = NextResponse.redirect(dashboardUrl, { status: 307 });
  response.headers.set('x-gymos-authorization', 'denied');
  response.headers.set('x-gymos-denial-status', '403');

  return applyRefreshedCookies(refreshedCookies, response, cookieOverrides);
}

export async function middleware(request: NextRequest) {
  let refreshedResponse = NextResponse.next({ request });
  let refreshedCookies: PendingCookie[] = [];
  const { url, anonKey } = getSupabaseEnvironment();

  // Preserve the iframe-compatible cookie attributes when middleware rewrites
  // the refreshed session, otherwise the refresh downgrades it back to Lax.
  const secure = isSecureRequest(request.headers, request.url);
  const authCookieOptions = getAuthCookieOptions(secure);

  const supabase = createServerClient<Database>(url, anonKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        refreshedCookies = cookiesToSet;

        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        refreshedResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          refreshedResponse.cookies.set(name, value, {
            ...options,
            ...authCookieOptions,
          });
        });
      },
    },
  });

  // getUser() validates the access token with Supabase Auth and refreshes an
  // expired session when a refresh token is available. Never authorize from
  // getSession(), whose cookie payload is not independently verified here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginRoute = pathname === LOGIN_ROUTE;
  const isPublicRoute =
    isLoginRoute || PUBLIC_ROUTE_PREFIXES.some((route) => isRoute(pathname, route));

  if (!user) {
    return isPublicRoute
      ? refreshedResponse
      : redirectToLogin(request, refreshedCookies, authCookieOptions);
  }

  const authContext = parseAuthContext(user.app_metadata);

  // An authenticated identity without valid app_metadata is not authorized for
  // any tenant. This fails closed instead of accepting a tenant from the URL,
  // request body, user_metadata, or other client-controlled input. The login
  // page remains reachable so the invalid session can be replaced.
  if (!authContext) {
    return isPublicRoute
      ? refreshedResponse
      : redirectToLogin(request, refreshedCookies, authCookieOptions, 'invalid_claims');
  }

  if (isLoginRoute) {
    return redirectAuthenticatedUser(request, refreshedCookies, authCookieOptions, authContext.role);
  }

  if (isPublicRoute) {
    return refreshedResponse;
  }

  const accessingSuperadmin = isRoute(pathname, '/superadmin');
  const accessingOwnerSettings = isRoute(pathname, '/settings/owner');
  // The Owner Cockpit exposes drawer variance, staff attribution, and expense
  // approvals: strictly owner-only territory.
  const accessingOwnerCockpit = isRoute(pathname, '/owner');

  if (
    (authContext.role !== 'owner' && authContext.role !== 'superadmin' &&
      (accessingOwnerCockpit || accessingOwnerSettings)) ||
    (authContext.role === 'receptionist' && accessingSuperadmin) ||
    (authContext.role === 'owner' && accessingSuperadmin)
  ) {
    return redirectForbidden(request, refreshedCookies, authCookieOptions);
  }

  // Superadmins pass all route checks. Owners and receptionists pass routes not
  // explicitly restricted above. Database RLS remains the final data boundary.
  return refreshedResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2|ttf|otf)$).*)',
  ],
};
