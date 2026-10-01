import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/types/database';
import type { UserRole } from '@/lib/types';

const USER_ROLES = new Set<UserRole>(['receptionist', 'owner', 'superadmin']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthenticatedUserProfile = Tables<'users'>;

export interface CurrentUser {
  /** Supabase Auth identity returned by the verified getUser() request. */
  user: User;
  /** Tenant-scoped application profile from public.users. */
  profile: AuthenticatedUserProfile;
  /** Active tenant from trusted JWT app_metadata. */
  tenantId: string;
  /** Active role from trusted JWT app_metadata. */
  role: UserRole;
}

export class InvalidAuthClaimsError extends Error {
  constructor(message = 'Authenticated user has invalid authorization claims.') {
    super(message);
    this.name = 'InvalidAuthClaimsError';
  }
}

export class AuthProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthProfileError';
  }
}

function extractAuthorizationClaims(appMetadata: Record<string, unknown>): {
  tenantId: string;
  role: UserRole;
} {
  const tenantId = appMetadata.tenant_id;
  const role = appMetadata.role;

  if (
    typeof tenantId !== 'string' ||
    !UUID_PATTERN.test(tenantId) ||
    typeof role !== 'string' ||
    !USER_ROLES.has(role as UserRole)
  ) {
    throw new InvalidAuthClaimsError();
  }

  return { tenantId, role: role as UserRole };
}

/**
 * Returns the verified Supabase identity, tenant-scoped public profile, active
 * tenant ID, and role for the current server request.
 *
 * Returns null only when there is no authenticated user. Invalid/stale claims,
 * missing profiles, and profile/claim mismatches throw so authorization failures
 * cannot be mistaken for an anonymous session.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { tenantId, role } = extractAuthorizationClaims(user.app_metadata);

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .eq('tenant_id', tenantId)
    .single();

  if (profileError || !profile) {
    throw new AuthProfileError('Authenticated user profile could not be loaded.');
  }

  if (!profile.is_active) {
    throw new AuthProfileError('Authenticated user profile is inactive.');
  }

  if (profile.role !== role || profile.tenant_id !== tenantId) {
    throw new AuthProfileError(
      'Authorization claims do not match the tenant-scoped user profile.',
    );
  }

  return {
    user,
    profile,
    tenantId,
    role,
  };
}
