import { createClient } from '@/lib/supabase/server';
import {
  assertNonEmptyText,
  assertUuid,
  DataAccessError,
  normalizeOptionalText,
  requireMutationCapability,
  throwDatabaseError,
} from '@/lib/supabase/data-access';
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@/lib/types/database';
import type { UserRole } from '@/lib/types';

const TENANT_STAFF_ROLES = ['receptionist', 'owner'] as const satisfies readonly UserRole[];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MEMBER_STATUSES = new Set(['active', 'expired', 'paused', 'inactive']);
const PAYMENT_STATUSES = new Set(['pending', 'paid', 'failed', 'refunded', 'voided']);
const PAYMENT_METHODS = new Set(['cash', 'card', 'upi', 'bank_transfer', 'other']);
const ATTENDANCE_SOURCES = new Set(['reception', 'self_check_in', 'import', 'system']);

export interface CreateMemberInput {
  memberCode: string;
  fullName: string;
  phoneNumber: string;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  membershipStartedOn: string;
  membershipExpiresOn: string;
  status?: Enums<'member_status'>;
  notes?: string | null;
}

export interface UpdateMemberInput {
  memberCode?: string;
  fullName?: string;
  phoneNumber?: string;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  membershipStartedOn?: string;
  membershipExpiresOn?: string;
  status?: Enums<'member_status'>;
  notes?: string | null;
}

export interface RecordPaymentInput {
  memberId: string;
  amountMinor: number;
  discountMinor?: number;
  currency?: string;
  status?: Enums<'payment_status'>;
  method: Enums<'payment_method'>;
  referenceNumber?: string | null;
  paidAt?: string | null;
  periodStartsOn?: string | null;
  periodEndsOn?: string | null;
  notes?: string | null;
}

export interface LogMemberCheckInInput {
  memberId: string;
  checkedInAt?: string;
  source?: Enums<'attendance_source'>;
  notes?: string | null;
}

function assertIsoDate(value: string, fieldName: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new DataAccessError(
      'INVALID_INPUT',
      `${fieldName} must use YYYY-MM-DD format.`,
    );
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new DataAccessError('INVALID_INPUT', `${fieldName} is not a valid date.`);
  }
}

function assertNullableIsoDate(
  value: string | null | undefined,
  fieldName: string,
): void {
  if (typeof value === 'string') {
    assertIsoDate(value, fieldName);
  }
}

function assertIsoDateTime(value: string, fieldName: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new DataAccessError(
      'INVALID_INPUT',
      `${fieldName} must be a valid ISO date-time string.`,
    );
  }
}

function assertAllowedValue(
  value: string | undefined,
  allowed: ReadonlySet<string>,
  fieldName: string,
): void {
  if (value !== undefined && !allowed.has(value)) {
    throw new DataAccessError('INVALID_INPUT', `${fieldName} is not supported.`);
  }
}

function assertSafeMinorUnits(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DataAccessError(
      'INVALID_INPUT',
      `${fieldName} must be a non-negative safe integer in minor currency units.`,
    );
  }
}

function assertMembershipDateOrder(start: string, end: string): void {
  if (start > end) {
    throw new DataAccessError(
      'INVALID_INPUT',
      'membershipExpiresOn cannot be earlier than membershipStartedOn.',
    );
  }
}

/** Creates a member after application role checks; INSERT RLS checks again in PostgreSQL. */
export async function createMember(
  tenantId: string,
  input: CreateMemberInput,
): Promise<Tables<'members'>> {
  const currentUser = await requireMutationCapability(tenantId, TENANT_STAFF_ROLES);
  assertAllowedValue(input.status, MEMBER_STATUSES, 'status');
  const memberCode = assertNonEmptyText(input.memberCode, 'memberCode', 80);
  const fullName = assertNonEmptyText(input.fullName, 'fullName', 160);
  const phoneNumber = assertNonEmptyText(input.phoneNumber, 'phoneNumber', 20);

  if (phoneNumber.length < 7) {
    throw new DataAccessError(
      'INVALID_INPUT',
      'phoneNumber must contain at least 7 characters.',
    );
  }

  assertIsoDate(input.membershipStartedOn, 'membershipStartedOn');
  assertIsoDate(input.membershipExpiresOn, 'membershipExpiresOn');
  assertMembershipDateOrder(input.membershipStartedOn, input.membershipExpiresOn);
  assertNullableIsoDate(input.dateOfBirth, 'dateOfBirth');

  const payload = {
    tenant_id: tenantId,
    member_code: memberCode,
    full_name: fullName,
    phone_number: phoneNumber,
    email: normalizeOptionalText(input.email, 'email', 320) ?? null,
    date_of_birth: input.dateOfBirth ?? null,
    gender: normalizeOptionalText(input.gender, 'gender', 80) ?? null,
    address: normalizeOptionalText(input.address, 'address', 1_000) ?? null,
    emergency_contact_name:
      normalizeOptionalText(
        input.emergencyContactName,
        'emergencyContactName',
        160,
      ) ?? null,
    emergency_contact_phone:
      normalizeOptionalText(
        input.emergencyContactPhone,
        'emergencyContactPhone',
        20,
      ) ?? null,
    membership_started_on: input.membershipStartedOn,
    membership_expires_on: input.membershipExpiresOn,
    status: input.status ?? 'active',
    notes: normalizeOptionalText(input.notes, 'notes', 2_000) ?? null,
    created_by: currentUser.user.id,
  } satisfies TablesInsert<'members'>;

  const supabase = await createClient();
  const { data, error } = await supabase.from('members').insert(payload).select('*').single();

  if (error || !data) {
    throwDatabaseError('Create member', error ?? { message: 'No row returned' });
  }

  return data;
}

/** Updates mutable member fields; tenant and creator attribution cannot be changed. */
export async function updateMember(
  tenantId: string,
  memberId: string,
  input: UpdateMemberInput,
): Promise<Tables<'members'>> {
  await requireMutationCapability(tenantId, TENANT_STAFF_ROLES);
  assertUuid(memberId, 'memberId');
  assertAllowedValue(input.status, MEMBER_STATUSES, 'status');

  if (Object.keys(input).length === 0) {
    throw new DataAccessError('INVALID_INPUT', 'At least one member field is required.');
  }

  assertNullableIsoDate(input.dateOfBirth, 'dateOfBirth');

  if (input.membershipStartedOn) {
    assertIsoDate(input.membershipStartedOn, 'membershipStartedOn');
  }

  if (input.membershipExpiresOn) {
    assertIsoDate(input.membershipExpiresOn, 'membershipExpiresOn');
  }

  if (input.membershipStartedOn && input.membershipExpiresOn) {
    assertMembershipDateOrder(input.membershipStartedOn, input.membershipExpiresOn);
  }

  const payload: TablesUpdate<'members'> = {};

  if (input.memberCode !== undefined) {
    payload.member_code = assertNonEmptyText(input.memberCode, 'memberCode', 80);
  }
  if (input.fullName !== undefined) {
    payload.full_name = assertNonEmptyText(input.fullName, 'fullName', 160);
  }
  if (input.phoneNumber !== undefined) {
    payload.phone_number = assertNonEmptyText(input.phoneNumber, 'phoneNumber', 20);
    if (payload.phone_number.length < 7) {
      throw new DataAccessError('INVALID_INPUT', 'phoneNumber is too short.');
    }
  }
  if (input.email !== undefined) {
    payload.email = normalizeOptionalText(input.email, 'email', 320);
  }
  if (input.dateOfBirth !== undefined) payload.date_of_birth = input.dateOfBirth;
  if (input.gender !== undefined) {
    payload.gender = normalizeOptionalText(input.gender, 'gender', 80);
  }
  if (input.address !== undefined) {
    payload.address = normalizeOptionalText(input.address, 'address', 1_000);
  }
  if (input.emergencyContactName !== undefined) {
    payload.emergency_contact_name = normalizeOptionalText(
      input.emergencyContactName,
      'emergencyContactName',
      160,
    );
  }
  if (input.emergencyContactPhone !== undefined) {
    payload.emergency_contact_phone = normalizeOptionalText(
      input.emergencyContactPhone,
      'emergencyContactPhone',
      20,
    );
  }
  if (input.membershipStartedOn !== undefined) {
    payload.membership_started_on = input.membershipStartedOn;
  }
  if (input.membershipExpiresOn !== undefined) {
    payload.membership_expires_on = input.membershipExpiresOn;
  }
  if (input.status !== undefined) payload.status = input.status;
  if (input.notes !== undefined) {
    payload.notes = normalizeOptionalText(input.notes, 'notes', 2_000);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('members')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('id', memberId)
    .select('*')
    .single();

  if (error || !data) {
    throwDatabaseError('Update member', error ?? { code: 'PGRST116', message: 'Not found' });
  }

  return data;
}

/** Records a payment using integer minor units only; INSERT RLS rechecks role and tenant. */
export async function recordPayment(
  tenantId: string,
  input: RecordPaymentInput,
): Promise<Tables<'payments'>> {
  const currentUser = await requireMutationCapability(tenantId, TENANT_STAFF_ROLES);
  assertUuid(input.memberId, 'memberId');
  assertAllowedValue(input.status, PAYMENT_STATUSES, 'status');
  assertAllowedValue(input.method, PAYMENT_METHODS, 'method');
  assertSafeMinorUnits(input.amountMinor, 'amountMinor');

  const discountMinor = input.discountMinor ?? 0;
  assertSafeMinorUnits(discountMinor, 'discountMinor');

  if (discountMinor > input.amountMinor) {
    throw new DataAccessError(
      'INVALID_INPUT',
      'discountMinor cannot exceed amountMinor.',
    );
  }

  const currency = (input.currency ?? 'INR').toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new DataAccessError('INVALID_INPUT', 'currency must be a 3-letter ISO code.');
  }

  const status = input.status ?? 'paid';
  const paidAt =
    status === 'paid' ? (input.paidAt ?? new Date().toISOString()) : (input.paidAt ?? null);

  if (paidAt) {
    assertIsoDateTime(paidAt, 'paidAt');
  }

  assertNullableIsoDate(input.periodStartsOn, 'periodStartsOn');
  assertNullableIsoDate(input.periodEndsOn, 'periodEndsOn');

  if (input.periodStartsOn && input.periodEndsOn && input.periodStartsOn > input.periodEndsOn) {
    throw new DataAccessError(
      'INVALID_INPUT',
      'periodEndsOn cannot be earlier than periodStartsOn.',
    );
  }

  const payload = {
    tenant_id: tenantId,
    member_id: input.memberId,
    amount_minor: input.amountMinor,
    discount_minor: discountMinor,
    currency,
    status,
    method: input.method,
    reference_number:
      normalizeOptionalText(input.referenceNumber, 'referenceNumber', 200) ?? null,
    paid_at: paidAt,
    period_starts_on: input.periodStartsOn ?? null,
    period_ends_on: input.periodEndsOn ?? null,
    notes: normalizeOptionalText(input.notes, 'notes', 2_000) ?? null,
    recorded_by: currentUser.user.id,
  } satisfies TablesInsert<'payments'>;

  const supabase = await createClient();
  const { data, error } = await supabase.from('payments').insert(payload).select('*').single();

  if (error || !data) {
    throwDatabaseError('Record payment', error ?? { message: 'No row returned' });
  }

  return data;
}

/** Logs a member check-in after role and tenant checks; INSERT RLS checks both again. */
export async function logMemberCheckIn(
  tenantId: string,
  input: LogMemberCheckInInput,
): Promise<Tables<'attendance'>> {
  const currentUser = await requireMutationCapability(tenantId, TENANT_STAFF_ROLES);
  assertUuid(input.memberId, 'memberId');
  assertAllowedValue(input.source, ATTENDANCE_SOURCES, 'source');

  if (input.checkedInAt) {
    assertIsoDateTime(input.checkedInAt, 'checkedInAt');
  }

  const supabase = await createClient();

  const { data: existingOpenLog, error: openLogError } = await supabase
    .from('attendance')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('member_id', input.memberId)
    .is('checked_out_at', null)
    .limit(1)
    .maybeSingle();

  if (openLogError) {
    throwDatabaseError('Check existing attendance', openLogError);
  }

  if (existingOpenLog) {
    throw new DataAccessError(
      'CONFLICT',
      'The member already has an open attendance session.',
    );
  }

  const payload = {
    tenant_id: tenantId,
    member_id: input.memberId,
    checked_in_at: input.checkedInAt ?? new Date().toISOString(),
    source: input.source ?? 'reception',
    notes: normalizeOptionalText(input.notes, 'notes', 2_000) ?? null,
    recorded_by: currentUser.user.id,
  } satisfies TablesInsert<'attendance'>;

  const { data, error } = await supabase.from('attendance').insert(payload).select('*').single();

  if (error || !data) {
    throwDatabaseError('Log member check-in', error ?? { message: 'No row returned' });
  }

  return data;
}
