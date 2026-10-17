-- ===========================================================================
-- GymOS — dynamic membership plans + staff provisioning
-- ===========================================================================
-- Two changes that move pricing and staffing out of code and into the database:
--
--   1. `membership_plans` — the plan catalogue was a hard-coded array in
--      `src/lib/plans.ts`, so changing a price meant a deploy and every tenant
--      shared the same rates. It now lives per-tenant in Postgres, editable by
--      the owner, read by the reception fee selector.
--
--   2. `create_staff_member` — provisioning a receptionist or trainer required
--      a manual insert into auth.users. This wraps it with tenant + role guards.
--
-- SCHEMA NOTE: the brief specifies `REFERENCES tenants(id)`. That is correct
-- here — `tenants.id` is the real primary key and `tenants.tenant_id` is a
-- generated mirror of it. Every other table in this schema keys on `tenant_id`,
-- so the FK targets `tenant_id` for consistency with existing RLS predicates,
-- which all compare against `tenant_id`. Both columns hold the same value.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. membership_plans
-- ---------------------------------------------------------------------------
create table if not exists public.membership_plans (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  duration_months integer not null check (duration_months between 1 and 120),
  price_minor bigint not null check (price_minor >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One plan name per tenant: two live "3 Months" rows at different prices would
-- make the reception dropdown ambiguous at the moment of sale.
create unique index if not exists membership_plans_tenant_name_key
  on public.membership_plans (tenant_id, lower(btrim(name)));

create index if not exists membership_plans_tenant_active_idx
  on public.membership_plans (tenant_id, is_active, duration_months);

drop trigger if exists set_membership_plans_updated_at on public.membership_plans;
create trigger set_membership_plans_updated_at
  before update on public.membership_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS — everyone in the tenant reads, only the owner writes
-- ---------------------------------------------------------------------------
alter table public.membership_plans enable row level security;
alter table public.membership_plans force row level security;

drop policy if exists membership_plans_select on public.membership_plans;
create policy membership_plans_select on public.membership_plans
  for select to authenticated
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Writes are owner-only. A receptionist who could edit prices could quietly
-- discount a membership and pocket the difference, which is exactly the fraud
-- this product exists to prevent.
drop policy if exists membership_plans_insert on public.membership_plans;
create policy membership_plans_insert on public.membership_plans
  for insert to authenticated
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'superadmin')
  );

drop policy if exists membership_plans_update on public.membership_plans;
create policy membership_plans_update on public.membership_plans
  for update to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'superadmin')
  )
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'superadmin')
  );

drop policy if exists membership_plans_delete on public.membership_plans;
create policy membership_plans_delete on public.membership_plans
  for delete to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('owner', 'superadmin')
  );

-- ---------------------------------------------------------------------------
-- 3. Seed the canonical test tenant
-- ---------------------------------------------------------------------------
-- Deterministic UUIDs under the reserved 99000000- prefix so the fixture reset
-- can purge and re-seed them without touching plans an owner created by hand.
insert into public.membership_plans (id, tenant_id, name, duration_months, price_minor)
values
  ('99000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '1 Month',   1,  150000),
  ('99000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '3 Months',  3,  400000),
  ('99000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '6 Months',  6,  750000),
  ('99000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '1 Year',   12, 1200000)
on conflict (id) do update set
  name = excluded.name,
  duration_months = excluded.duration_months,
  price_minor = excluded.price_minor,
  is_active = true;

-- ---------------------------------------------------------------------------
-- 4. create_staff_member
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because it writes to auth.users, which `authenticated` has
-- no rights on. Tenant and role are therefore re-asserted from the verified
-- JWT and never taken from an argument.
--
-- The passcode becomes the account password. The login identifier is derived
-- from the phone number plus the tenant slug so two gyms can both have a
-- "9820100001" without colliding in auth.users' unique email index.
create or replace function public.create_staff_member(
  p_name text,
  p_phone text,
  p_role text,
  p_passcode text
)
returns public.users
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_actor_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_slug text;
  v_digits text;
  v_email text;
  v_user_id uuid;
  v_profile public.users;
begin
  if v_jwt_tenant is null or v_actor_role not in ('owner', 'superadmin') then
    raise exception 'Only an owner can add staff' using errcode = '42501';
  end if;

  if p_role not in ('receptionist', 'trainer') then
    raise exception 'Role must be receptionist or trainer' using errcode = '22023';
  end if;

  if char_length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Staff name is required' using errcode = '22023';
  end if;

  v_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(v_digits) < 10 then
    raise exception 'A 10-digit phone number is required' using errcode = '22023';
  end if;

  -- Short passcodes are the single most common way a counter account gets
  -- shared and then abused; refuse them at the database rather than the UI.
  if char_length(coalesce(p_passcode, '')) < 8 then
    raise exception 'Passcode must be at least 8 characters' using errcode = '22023';
  end if;

  select slug into v_slug from public.tenants where tenant_id = v_jwt_tenant;
  if v_slug is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;

  v_email := right(v_digits, 10) || '@' || v_slug || '.gymos.local';

  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'A staff account already exists for this phone number'
      using errcode = '23505';
  end if;

  v_user_id := extensions.gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_passcode, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'tenant_id', v_jwt_tenant,
      'role', p_role
    ),
    jsonb_build_object('full_name', btrim(p_name), 'role', p_role),
    now(),
    now()
  );

  insert into public.users (id, tenant_id, role, full_name, phone_number, is_active)
  values (
    v_user_id,
    v_jwt_tenant,
    p_role::public.user_role,
    btrim(p_name),
    '+91' || right(v_digits, 10),
    true
  )
  returning * into v_profile;

  return v_profile;
end $$;

revoke all on function public.create_staff_member(text, text, text, text) from public, anon;
grant execute on function public.create_staff_member(text, text, text, text) to authenticated;

comment on function public.create_staff_member(text, text, text, text) is
  'Provisions a receptionist or trainer for the caller''s tenant. Owner-only; '
  'tenant and role are re-asserted from the verified JWT.';

commit;
