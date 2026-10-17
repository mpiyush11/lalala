import { getCurrentUser, type CurrentUser } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DataAccessErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'DATABASE_ERROR';

export class DataAccessError extends Error {
  readonly code: DataAccessErrorCode;
  readonly cause?: unknown;

  constructor(code: DataAccessErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DataAccessError';
    this.code = code;
    this.cause = cause;
  }
}

export function assertUuid(value: string, fieldName: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new DataAccessError('INVALID_INPUT', `${fieldName} must be a valid UUID.`);
  }
}

export function assertNonEmptyText(
  value: string,
  fieldName: string,
  maxLength: number,
): string {
  const normalized = value.trim();

  if (!normalized || normalized.length > maxLength) {
    throw new DataAccessError(
      'INVALID_INPUT',
      `${fieldName} must contain between 1 and ${maxLength} characters.`,
    );
  }

  return normalized;
}

export function normalizeOptionalText(
  value: string | null | undefined,
  fieldName: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw new DataAccessError(
      'INVALID_INPUT',
      `${fieldName} cannot exceed ${maxLength} characters.`,
    );
  }

  return normalized || null;
}

export async function requireTenantContext(tenantId: string): Promise<CurrentUser> {
  assertUuid(tenantId, 'tenantId');

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    throw new DataAccessError(
      'AUTHENTICATION_REQUIRED',
      'An authenticated user is required.',
    );
  }

  if (currentUser.tenantId !== tenantId) {
    throw new DataAccessError(
      'FORBIDDEN',
      'The requested tenant does not match the active tenant.',
    );
  }

  return currentUser;
}

/**
 * Application-layer capability check. PostgreSQL grants and RLS independently
 * enforce the same capability after this check (defense in depth).
 */
export async function requireMutationCapability(
  tenantId: string,
  allowedRoles: readonly UserRole[],
): Promise<CurrentUser> {
  const currentUser = await requireTenantContext(tenantId);

  if (!allowedRoles.includes(currentUser.role)) {
    throw new DataAccessError(
      'FORBIDDEN',
      `Role '${currentUser.role}' cannot perform this operation.`,
    );
  }

  return currentUser;
}

export function throwDatabaseError(
  operation: string,
  error: { code?: string; message: string; details?: string | null },
): never {
  if (error.code === 'PGRST116') {
    throw new DataAccessError('NOT_FOUND', `${operation}: record not found.`, error);
  }

  if (error.code === '23505') {
    throw new DataAccessError(
      'CONFLICT',
      `${operation}: a record with the same unique value already exists.`,
      error,
    );
  }

  if (error.code === '23503') {
    throw new DataAccessError(
      'NOT_FOUND',
      `${operation}: a referenced tenant record does not exist.`,
      error,
    );
  }

  throw new DataAccessError(
    'DATABASE_ERROR',
    `${operation} failed.`,
    error,
  );
}
