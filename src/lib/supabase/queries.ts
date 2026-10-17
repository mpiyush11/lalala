import { createClient } from '@/lib/supabase/server';
import {
  assertUuid,
  DataAccessError,
  requireTenantContext,
  throwDatabaseError,
} from '@/lib/supabase/data-access';
import type { Enums, Tables } from '@/lib/types/database';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 80;
const MEMBER_SORT_FIELDS = new Set([
  'full_name',
  'membership_expires_on',
  'created_at',
  'status',
]);
const PAYMENT_SORT_FIELDS = new Set(['paid_at', 'created_at', 'amount_minor', 'status']);
const MEMBER_STATUSES = new Set(['active', 'expired', 'paused', 'inactive']);
const PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded', 'voided']);
const ATTENDANCE_SOURCES = new Set(['reception', 'self_check_in', 'import', 'system']);
const SORT_DIRECTIONS = new Set(['asc', 'desc']);

type SortDirection = 'asc' | 'desc';
type MemberStatus = Enums<'member_status'>;
type PaymentStatus = Enums<'payment_status'>;
type AttendanceSource = Enums<'attendance_source'>;

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface GetMembersOptions extends PaginationInput {
  search?: string;
  statuses?: readonly MemberStatus[];
  sortBy?: 'full_name' | 'membership_expires_on' | 'created_at' | 'status';
  sortDirection?: SortDirection;
}

export interface GetPaymentsOptions extends PaginationInput {
  memberId?: string;
  search?: string;
  statuses?: readonly PaymentStatus[];
  sortBy?: 'paid_at' | 'created_at' | 'amount_minor' | 'status';
  sortDirection?: SortDirection;
}

export interface GetAttendanceLogsOptions extends PaginationInput {
  memberId?: string;
  source?: AttendanceSource;
  checkedInFrom?: string;
  checkedInTo?: string;
  sortDirection?: SortDirection;
}

function normalizePagination(input: PaginationInput): {
  from: number;
  page: number;
  pageSize: number;
  to: number;
} {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  if (!Number.isSafeInteger(page) || page < 1) {
    throw new DataAccessError('INVALID_INPUT', 'page must be a positive safe integer.');
  }

  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new DataAccessError(
      'INVALID_INPUT',
      `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.`,
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
    throw new DataAccessError('INVALID_INPUT', 'Requested pagination range is too large.');
  }

  return { from, page, pageSize, to };
}

function normalizeSearch(search: string | undefined): string | null {
  if (search === undefined) {
    return null;
  }

  const normalized = search.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length > MAX_SEARCH_LENGTH) {
    throw new DataAccessError(
      'INVALID_INPUT',
      `search cannot exceed ${MAX_SEARCH_LENGTH} characters.`,
    );
  }

  // Commas and parentheses are PostgREST .or() control characters. Rejecting
  // them prevents a search term from changing the fixed filter expression.
  if (/[(),\\]/u.test(normalized)) {
    throw new DataAccessError(
      'INVALID_INPUT',
      'search contains unsupported filter control characters.',
    );
  }

  return normalized;
}

function assertAllowedOption(
  value: string | undefined,
  allowed: ReadonlySet<string>,
  fieldName: string,
): void {
  if (value !== undefined && !allowed.has(value)) {
    throw new DataAccessError('INVALID_INPUT', `${fieldName} is not supported.`);
  }
}

function assertAllowedOptions(
  values: readonly string[] | undefined,
  allowed: ReadonlySet<string>,
  fieldName: string,
): void {
  if (values?.some((value) => !allowed.has(value))) {
    throw new DataAccessError('INVALID_INPUT', `${fieldName} contains an unsupported value.`);
  }
}

function assertSortDirection(value: string | undefined): void {
  assertAllowedOption(value, SORT_DIRECTIONS, 'sortDirection');
}

function assertIsoDateTime(value: string, fieldName: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new DataAccessError(
      'INVALID_INPUT',
      `${fieldName} must be a valid ISO date-time string.`,
    );
  }
}

function paginated<T>(
  data: T[],
  count: number | null,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  const resolvedCount = count ?? 0;

  return {
    data,
    count: resolvedCount,
    page,
    pageSize,
    totalPages: Math.ceil(resolvedCount / pageSize),
  };
}

/** Fetches members visible to the active tenant with bounded pagination. */
export async function getMembers(
  tenantId: string,
  options: GetMembersOptions = {},
): Promise<PaginatedResult<Tables<'members'>>> {
  await requireTenantContext(tenantId);
  assertAllowedOption(options.sortBy, MEMBER_SORT_FIELDS, 'sortBy');
  assertAllowedOptions(options.statuses, MEMBER_STATUSES, 'statuses');
  assertSortDirection(options.sortDirection);
  const { from, page, pageSize, to } = normalizePagination(options);
  const search = normalizeSearch(options.search);
  const supabase = await createClient();

  let query = supabase
    .from('members')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `full_name.ilike.${pattern},phone_number.ilike.${pattern},member_code.ilike.${pattern}`,
    );
  }

  if (options.statuses?.length) {
    query = query.in('status', [...new Set(options.statuses)]);
  }

  const { data, count, error } = await query
    .order(options.sortBy ?? 'created_at', {
      ascending: (options.sortDirection ?? 'desc') === 'asc',
    })
    .range(from, to);

  if (error) {
    throwDatabaseError('Fetch members', error);
  }

  return paginated(data ?? [], count, page, pageSize);
}

/** Fetches one member only when both its ID and active tenant match. */
export async function getMemberById(
  tenantId: string,
  memberId: string,
): Promise<Tables<'members'>> {
  await requireTenantContext(tenantId);
  assertUuid(memberId, 'memberId');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', memberId)
    .single();

  if (error || !data) {
    throwDatabaseError('Fetch member', error ?? { code: 'PGRST116', message: 'Not found' });
  }

  return data;
}

/** Fetches tenant payments with optional member, reference, and status filters. */
export async function getPayments(
  tenantId: string,
  options: GetPaymentsOptions = {},
): Promise<PaginatedResult<Tables<'payments'>>> {
  await requireTenantContext(tenantId);
  assertAllowedOption(options.sortBy, PAYMENT_SORT_FIELDS, 'sortBy');
  assertAllowedOptions(options.statuses, PAYMENT_STATUSES, 'statuses');
  assertSortDirection(options.sortDirection);
  const { from, page, pageSize, to } = normalizePagination(options);
  const search = normalizeSearch(options.search);

  if (options.memberId) {
    assertUuid(options.memberId, 'memberId');
  }

  const supabase = await createClient();
  let query = supabase
    .from('payments')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (options.memberId) {
    query = query.eq('member_id', options.memberId);
  }

  if (search) {
    query = query.ilike('reference_number', `%${search}%`);
  }

  if (options.statuses?.length) {
    query = query.in('status', [...new Set(options.statuses)]);
  }

  const { data, count, error } = await query
    .order(options.sortBy ?? 'created_at', {
      ascending: (options.sortDirection ?? 'desc') === 'asc',
      nullsFirst: false,
    })
    .range(from, to);

  if (error) {
    throwDatabaseError('Fetch payments', error);
  }

  return paginated(data ?? [], count, page, pageSize);
}

/** Fetches tenant attendance logs with bounded time and member filters. */
export async function getAttendanceLogs(
  tenantId: string,
  options: GetAttendanceLogsOptions = {},
): Promise<PaginatedResult<Tables<'attendance'>>> {
  await requireTenantContext(tenantId);
  assertAllowedOption(options.source, ATTENDANCE_SOURCES, 'source');
  assertSortDirection(options.sortDirection);
  const { from, page, pageSize, to } = normalizePagination(options);

  if (options.memberId) {
    assertUuid(options.memberId, 'memberId');
  }

  if (options.checkedInFrom) {
    assertIsoDateTime(options.checkedInFrom, 'checkedInFrom');
  }

  if (options.checkedInTo) {
    assertIsoDateTime(options.checkedInTo, 'checkedInTo');
  }

  if (
    options.checkedInFrom &&
    options.checkedInTo &&
    Date.parse(options.checkedInFrom) > Date.parse(options.checkedInTo)
  ) {
    throw new DataAccessError(
      'INVALID_INPUT',
      'checkedInFrom cannot be later than checkedInTo.',
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from('attendance')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (options.memberId) {
    query = query.eq('member_id', options.memberId);
  }

  if (options.source) {
    query = query.eq('source', options.source);
  }

  if (options.checkedInFrom) {
    query = query.gte('checked_in_at', options.checkedInFrom);
  }

  if (options.checkedInTo) {
    query = query.lte('checked_in_at', options.checkedInTo);
  }

  const { data, count, error } = await query
    .order('checked_in_at', {
      ascending: (options.sortDirection ?? 'desc') === 'asc',
    })
    .range(from, to);

  if (error) {
    throwDatabaseError('Fetch attendance logs', error);
  }

  return paginated(data ?? [], count, page, pageSize);
}
