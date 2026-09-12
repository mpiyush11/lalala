begin;

create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('receptionist', 'owner', 'superadmin');
create type public.tenant_status as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled');
create type public.member_status as enum ('active', 'expired', 'paused', 'inactive');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'voided');
create type public.payment_method as enum ('cash', 'card', 'upi', 'bank_transfer', 'other');
create type public.attendance_source as enum ('reception', 'self_check_in', 'import', 'system');

create table public.tenants (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid generated always as (id) stored not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.tenant_status not null default 'trial',
  phone text,
  email text,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  subscription_plan text,
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.tenants.tenant_id is
  'Self-identifying tenant key. Generated from id so every RLS-protected table, including tenants, has a mandatory tenant_id.';

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on update cascade on delete restrict,
  role public.user_role not null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
  phone_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_id_tenant_id_key unique (id, tenant_id)
);

create table public.members (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on update cascade on delete restrict,
  member_code text not null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
  phone_number text not null check (char_length(btrim(phone_number)) between 7 and 20),
  email text,
  date_of_birth date,
  gender text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  membership_started_on date not null,
  membership_expires_on date not null,
  status public.member_status not null default 'active',
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_tenant_phone_number_key unique (tenant_id, phone_number),
  constraint members_tenant_member_code_key unique (tenant_id, member_code),
  constraint members_id_tenant_id_key unique (id, tenant_id),
  constraint members_membership_dates_check check (membership_expires_on >= membership_started_on),
  constraint members_created_by_tenant_fkey
    foreign key (created_by, tenant_id) references public.users(id, tenant_id)
    on update cascade on delete restrict
);

create table public.payments (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on update cascade on delete restrict,
  member_id uuid not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  status public.payment_status not null default 'pending',
  method public.payment_method not null,
  reference_number text,
  paid_at timestamptz,
  period_starts_on date,
  period_ends_on date,
  discount_minor bigint not null default 0 check (discount_minor >= 0 and discount_minor <= amount_minor),
  notes text,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_id_tenant_id_key unique (id, tenant_id),
  constraint payments_period_dates_check check (
    period_ends_on is null or period_starts_on is null or period_ends_on >= period_starts_on
  ),
  constraint payments_paid_status_check check (status <> 'paid' or paid_at is not null),
  constraint payments_member_tenant_fkey
    foreign key (member_id, tenant_id) references public.members(id, tenant_id)
    on update cascade on delete restrict,
  constraint payments_recorded_by_tenant_fkey
    foreign key (recorded_by, tenant_id) references public.users(id, tenant_id)
    on update cascade on delete restrict
);

create table public.attendance (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on update cascade on delete restrict,
  member_id uuid not null,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  source public.attendance_source not null default 'reception',
  notes text,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_id_tenant_id_key unique (id, tenant_id),
  constraint attendance_checkout_check check (
    checked_out_at is null or checked_out_at >= checked_in_at
  ),
  constraint attendance_member_tenant_fkey
    foreign key (member_id, tenant_id) references public.members(id, tenant_id)
    on update cascade on delete restrict,
  constraint attendance_recorded_by_tenant_fkey
    foreign key (recorded_by, tenant_id) references public.users(id, tenant_id)
    on update cascade on delete restrict
);

-- Explicit B-tree indexes for tenant filters and high-frequency lookups.
create index users_tenant_id_idx on public.users using btree (tenant_id);
create index members_tenant_id_idx on public.members using btree (tenant_id);
create index members_phone_number_idx on public.members using btree (phone_number);
create index payments_tenant_id_idx on public.payments using btree (tenant_id);
create index payments_member_id_idx on public.payments using btree (member_id);
create index attendance_tenant_id_idx on public.attendance using btree (tenant_id);
create index attendance_member_id_idx on public.attendance using btree (member_id);
create index attendance_tenant_checked_in_idx
  on public.attendance using btree (tenant_id, checked_in_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create trigger attendance_set_updated_at
before update on public.attendance
for each row execute function public.set_updated_at();

-- Defense in depth: RLS already permits DELETE only to owners. This trigger also
-- blocks direct authenticated receptionist/superadmin deletion if RLS is bypassed
-- accidentally. PostgreSQL administrators and the service role remain available
-- for controlled maintenance and recovery operations.
create or replace function public.enforce_owner_only_delete()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'owner' then
    raise exception 'Only an owner may delete records from %.', tg_table_name
      using errcode = '42501';
  end if;

  return old;
end;
$$;

create trigger members_owner_only_delete
before delete on public.members
for each row execute function public.enforce_owner_only_delete();

create trigger payments_owner_only_delete
before delete on public.payments
for each row execute function public.enforce_owner_only_delete();

create trigger attendance_owner_only_delete
before delete on public.attendance
for each row execute function public.enforce_owner_only_delete();

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.members enable row level security;
alter table public.payments enable row level security;
alter table public.attendance enable row level security;

alter table public.tenants force row level security;
alter table public.users force row level security;
alter table public.members force row level security;
alter table public.payments force row level security;
alter table public.attendance force row level security;

-- TENANTS: authenticated users can read their own tenant; only owners can update it.
create policy tenants_select_same_tenant
on public.tenants
for select
to authenticated
using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy tenants_update_owner
on public.tenants
for update
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'owner'
)
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'owner'
);

-- USERS: tenant staff can read their tenant directory. Staff creation is reserved
-- for trusted onboarding/admin flows; owners may update non-superadmin staff only.
create policy users_select_same_tenant
on public.users
for select
to authenticated
using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy users_update_owner
on public.users
for update
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'owner'
  and role <> 'superadmin'
)
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'owner'
  and role in ('receptionist', 'owner')
);

-- MEMBERS: owner and receptionist can operate in their own tenant. DELETE is owner-only.
create policy members_select_same_tenant
on public.members
for select
to authenticated
using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy members_insert_tenant_staff
on public.members
for insert
to authenticated
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' in ('receptionist', 'owner')
  and created_by = auth.uid()
);

create policy members_update_tenant_staff
on public.members
for update
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' in ('receptionist', 'owner')
)
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' in ('receptionist', 'owner')
);

create policy members_delete_owner_only
on public.members
for delete
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'owner'
);

-- PAYMENTS: no anonymous access and no receptionist DELETE permission.
create policy payments_select_same_tenant
on public.payments
for select
to authenticated
using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy payments_insert_tenant_staff
on public.payments
for insert
to authenticated
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' in ('receptionist', 'owner')
  and recorded_by = auth.uid()
);

create policy payments_update_tenant_staff
on public.payments
for update
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' in ('receptionist', 'owner')
)
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' in ('receptionist', 'owner')
);

create policy payments_delete_owner_only
on public.payments
for delete
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'owner'
);

-- ATTENDANCE: no anonymous access and no receptionist DELETE permission.
create policy attendance_select_same_tenant
on public.attendance
for select
to authenticated
using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

create policy attendance_insert_tenant_staff
on public.attendance
for insert
to authenticated
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' in ('receptionist', 'owner')
  and recorded_by = auth.uid()
);

create policy attendance_update_tenant_staff
on public.attendance
for update
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' in ('receptionist', 'owner')
)
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' in ('receptionist', 'owner')
);

create policy attendance_delete_owner_only
on public.attendance
for delete
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  and auth.jwt() -> 'app_metadata' ->> 'role' = 'owner'
);

-- API grants are necessary before RLS is evaluated. Anonymous users receive no
-- table privileges. DELETE is granted to the shared authenticated DB role, then
-- constrained to app role=owner by both RLS and the owner-only trigger above.
revoke all on table public.tenants, public.users, public.members, public.payments, public.attendance from anon;
revoke all on table public.tenants, public.users, public.members, public.payments, public.attendance from authenticated;

grant select on table public.tenants, public.users, public.members, public.payments, public.attendance to authenticated;
grant insert on table public.members, public.payments, public.attendance to authenticated;
grant update on table public.tenants, public.users, public.members, public.payments, public.attendance to authenticated;
grant delete on table public.members, public.payments, public.attendance to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_owner_only_delete() from public, anon, authenticated;

commit;
