/** UUID serialized as a string by Supabase. */
export type UUID = string;

/** ISO 8601 timestamp, for example `2026-08-07T10:30:00.000Z`. */
export type ISODateTime = string;

/** ISO 8601 calendar date in `YYYY-MM-DD` format. */
export type ISODate = string;

/** Roles recognized by GymOS authorization policies. */
export type UserRole = 'receptionist' | 'owner' | 'superadmin' | 'trainer';

export type TenantStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
export type MemberStatus = 'active' | 'expired' | 'paused' | 'inactive';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'voided';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'other';
export type AttendanceSource = 'reception' | 'self_check_in' | 'import' | 'system';

/** A gym/business account. All tenant-owned records reference this entity. */
export interface Tenant {
  id: UUID;
  /** Self-identifying tenant key; equal to `id` in the database. */
  tenant_id: UUID;
  name: string;
  slug: string;
  status: TenantStatus;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
  is_attendance_enabled: boolean;
  subscription_plan: string | null;
  subscription_expires_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** A member belonging to exactly one tenant. */
export interface Member {
  id: UUID;
  tenant_id: UUID;
  member_code: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  date_of_birth: ISODate | null;
  gender: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  membership_started_on: ISODate;
  membership_expires_on: ISODate;
  status: MemberStatus;
  notes: string | null;
  created_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** A tenant-scoped payment record. Amounts use integer minor units (paise for INR). */
export interface Payment {
  id: UUID;
  tenant_id: UUID;
  member_id: UUID;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  reference_number: string | null;
  receipt_hash: string;
  receipt_security_code: string;
  paid_at: ISODateTime | null;
  period_starts_on: ISODate | null;
  period_ends_on: ISODate | null;
  discount_minor: number;
  notes: string | null;
  recorded_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** A member check-in session. A null `checked_out_at` represents an open session. */
export interface Attendance {
  id: UUID;
  tenant_id: UUID;
  member_id: UUID;
  checked_in_at: ISODateTime;
  checked_out_at: ISODateTime | null;
  source: AttendanceSource;
  notes: string | null;
  recorded_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}
