-- GymOS deterministic development/test seed.
-- Test password for all seeded users: GymOS-Test-2026!
-- NEVER use these accounts or this password in production.

begin;

set local search_path = public, auth, extensions;

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
insert into public.tenants (
  id,
  name,
  slug,
  status,
  phone,
  email,
  timezone,
  currency,
  subscription_plan,
  subscription_expires_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Iron Paradise Gym',
    'ironparadise',
    'active',
    '+919876500001',
    'admin@ironparadise.com',
    'Asia/Kolkata',
    'INR',
    'pro',
    '2027-08-31 18:29:59+00'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Powerhouse Fitness',
    'powerhouse',
    'active',
    '+919876500002',
    'admin@powerhouse.com',
    'Asia/Kolkata',
    'INR',
    'starter',
    '2027-08-31 18:29:59+00'
  )
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  phone = excluded.phone,
  email = excluded.email,
  timezone = excluded.timezone,
  currency = excluded.currency,
  subscription_plan = excluded.subscription_plan,
  subscription_expires_at = excluded.subscription_expires_at;

-- ---------------------------------------------------------------------------
-- Supabase Auth users. raw_app_meta_data is server-controlled and becomes the
-- verified app_metadata claim after sign-in/token refresh.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'owner@ironparadise.com',
    extensions.crypt('GymOS-Test-2026!', extensions.gen_salt('bf')),
    now(),
    now(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'tenant_id', '10000000-0000-4000-8000-000000000001',
      'role', 'owner'
    ),
    jsonb_build_object('full_name', 'Aarav Sharma'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'reception@ironparadise.com',
    extensions.crypt('GymOS-Test-2026!', extensions.gen_salt('bf')),
    now(),
    now(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'tenant_id', '10000000-0000-4000-8000-000000000001',
      'role', 'receptionist'
    ),
    jsonb_build_object('full_name', 'Meera Joshi'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'owner@powerhouse.com',
    extensions.crypt('GymOS-Test-2026!', extensions.gen_salt('bf')),
    now(),
    now(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'tenant_id', '10000000-0000-4000-8000-000000000002',
      'role', 'owner'
    ),
    jsonb_build_object('full_name', 'Kabir Verma'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do update
set
  aud = excluded.aud,
  role = excluded.role,
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

-- Email identities are required for password sign-in through Supabase Auth.
insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'sub', '20000000-0000-4000-8000-000000000001',
      'email', 'owner@ironparadise.com',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'sub', '20000000-0000-4000-8000-000000000002',
      'email', 'reception@ironparadise.com',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  ),
  (
    '21000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    jsonb_build_object(
      'sub', '20000000-0000-4000-8000-000000000003',
      'email', 'owner@powerhouse.com',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  )
on conflict (provider_id, provider) do update
set
  user_id = excluded.user_id,
  identity_data = excluded.identity_data,
  last_sign_in_at = excluded.last_sign_in_at,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Tenant-scoped application users
-- ---------------------------------------------------------------------------
insert into public.users (id, tenant_id, role, full_name, phone_number, is_active)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'owner',
    'Aarav Sharma',
    '+919876510001',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'receptionist',
    'Meera Joshi',
    '+919876510002',
    true
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'owner',
    'Kabir Verma',
    '+919876520001',
    true
  )
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  role = excluded.role,
  full_name = excluded.full_name,
  phone_number = excluded.phone_number,
  is_active = excluded.is_active;

-- ---------------------------------------------------------------------------
-- Members: two at Iron Paradise and two at Powerhouse.
-- ---------------------------------------------------------------------------
insert into public.members (
  id,
  tenant_id,
  member_code,
  full_name,
  phone_number,
  email,
  membership_started_on,
  membership_expires_on,
  status,
  notes,
  created_by
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'IPG-1001',
    'Rohan Mehta',
    '+919810000001',
    'rohan@example.test',
    '2026-08-01',
    '2027-07-31',
    'active',
    'Annual strength plan',
    '20000000-0000-4000-8000-000000000002'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'IPG-1002',
    'Priya Nair',
    '+919810000002',
    'priya@example.test',
    '2026-07-15',
    '2027-01-14',
    'active',
    'Six-month fitness plan',
    '20000000-0000-4000-8000-000000000002'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'PHF-2001',
    'Vikram Singh',
    '+919820000001',
    'vikram@example.test',
    '2026-08-01',
    '2027-01-31',
    'active',
    'Six-month premium plan',
    '20000000-0000-4000-8000-000000000003'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    'PHF-2002',
    'Ananya Gupta',
    '+919820000002',
    'ananya@example.test',
    '2026-06-01',
    '2027-05-31',
    'active',
    'Annual cardio plan',
    '20000000-0000-4000-8000-000000000003'
  )
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  member_code = excluded.member_code,
  full_name = excluded.full_name,
  phone_number = excluded.phone_number,
  email = excluded.email,
  membership_started_on = excluded.membership_started_on,
  membership_expires_on = excluded.membership_expires_on,
  status = excluded.status,
  notes = excluded.notes,
  created_by = excluded.created_by;

-- ---------------------------------------------------------------------------
-- Payment history. All monetary values are integer minor units (paise for INR).
-- ---------------------------------------------------------------------------
insert into public.payments (
  id,
  tenant_id,
  member_id,
  amount_minor,
  currency,
  status,
  method,
  reference_number,
  paid_at,
  period_starts_on,
  period_ends_on,
  discount_minor,
  notes,
  recorded_by
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    1800000,
    'INR',
    'paid',
    'upi',
    'UPI-IPG-1001',
    '2026-08-01 04:30:00+00',
    '2026-08-01',
    '2027-07-31',
    100000,
    'Annual plan paid in full',
    '20000000-0000-4000-8000-000000000002'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    900000,
    'INR',
    'paid',
    'cash',
    'CASH-IPG-1002',
    '2026-07-15 05:00:00+00',
    '2026-07-15',
    '2027-01-14',
    0,
    'Six-month plan',
    '20000000-0000-4000-8000-000000000002'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
    1200000,
    'INR',
    'paid',
    'card',
    'CARD-PHF-2001',
    '2026-08-01 06:00:00+00',
    '2026-08-01',
    '2027-01-31',
    0,
    'Premium membership',
    '20000000-0000-4000-8000-000000000003'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000004',
    2000000,
    'INR',
    'paid',
    'bank_transfer',
    'BANK-PHF-2002',
    '2026-06-01 04:00:00+00',
    '2026-06-01',
    '2027-05-31',
    200000,
    'Annual plan with owner-approved discount',
    '20000000-0000-4000-8000-000000000003'
  )
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  member_id = excluded.member_id,
  amount_minor = excluded.amount_minor,
  currency = excluded.currency,
  status = excluded.status,
  method = excluded.method,
  reference_number = excluded.reference_number,
  paid_at = excluded.paid_at,
  period_starts_on = excluded.period_starts_on,
  period_ends_on = excluded.period_ends_on,
  discount_minor = excluded.discount_minor,
  notes = excluded.notes,
  recorded_by = excluded.recorded_by;

-- ---------------------------------------------------------------------------
-- Closed attendance sessions provide deterministic history for heatmaps/tests.
-- ---------------------------------------------------------------------------
insert into public.attendance (
  id,
  tenant_id,
  member_id,
  checked_in_at,
  checked_out_at,
  source,
  notes,
  recorded_by
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '2026-08-05 00:45:00+00',
    '2026-08-05 02:00:00+00',
    'reception',
    'Morning workout',
    '20000000-0000-4000-8000-000000000002'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '2026-08-06 12:30:00+00',
    '2026-08-06 13:40:00+00',
    'reception',
    'Evening workout',
    '20000000-0000-4000-8000-000000000002'
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
    '2026-08-06 01:15:00+00',
    '2026-08-06 02:30:00+00',
    'reception',
    'Strength session',
    '20000000-0000-4000-8000-000000000003'
  ),
  (
    '50000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000004',
    '2026-08-07 00:30:00+00',
    '2026-08-07 01:40:00+00',
    'reception',
    'Cardio session',
    '20000000-0000-4000-8000-000000000003'
  )
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  member_id = excluded.member_id,
  checked_in_at = excluded.checked_in_at,
  checked_out_at = excluded.checked_out_at,
  source = excluded.source,
  notes = excluded.notes,
  recorded_by = excluded.recorded_by;

commit;
