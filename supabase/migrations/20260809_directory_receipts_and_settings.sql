begin;

alter table public.tenants
  add column is_attendance_enabled boolean not null default true;

alter table public.payments
  add column receipt_hash text,
  add column receipt_security_code text;

create unique index payments_receipt_hash_key
  on public.payments using btree (receipt_hash)
  where receipt_hash is not null;

create unique index payments_receipt_security_code_key
  on public.payments using btree (receipt_security_code)
  where receipt_security_code is not null;

create or replace function public.set_payment_receipt_hash()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
set timezone = 'UTC'
as $$
declare
  v_canonical text;
  v_hash text;
begin
  v_canonical := concat_ws('|',
    new.id::text,
    new.tenant_id::text,
    new.member_id::text,
    new.amount_minor::text,
    new.currency,
    new.status::text,
    new.method::text,
    coalesce(new.paid_at::text, ''),
    new.created_at::text
  );
  v_hash := encode(extensions.digest(v_canonical, 'sha256'), 'hex');
  new.receipt_hash := v_hash;
  new.receipt_security_code := 'SEC-' || upper(substr(v_hash, 1, 4)) || '-' || upper(substr(v_hash, 5, 4));
  return new;
end;
$$;

create trigger payments_set_receipt_hash
before insert or update of tenant_id, member_id, amount_minor, currency, status, method, paid_at
on public.payments
for each row execute function public.set_payment_receipt_hash();

-- Backfill deterministic receipt hashes for existing payment history.
update public.payments
set amount_minor = amount_minor;

alter table public.payments
  alter column receipt_hash set not null,
  alter column receipt_security_code set not null;

create or replace function public.enforce_member_expiry_owner_only()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
begin
  if old.membership_expires_on is distinct from new.membership_expires_on
     and current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'owner' then
    raise exception 'Only an owner may manually override membership expiry'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger members_expiry_owner_only
before update of membership_expires_on on public.members
for each row execute function public.enforce_member_expiry_owner_only();

create or replace function public.prevent_receptionist_paid_payment_tampering()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
begin
  if old.status = 'paid'
     and current_user not in ('postgres', 'service_role')
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'receptionist'
     and (
       old.member_id is distinct from new.member_id
       or old.amount_minor is distinct from new.amount_minor
       or old.currency is distinct from new.currency
       or old.method is distinct from new.method
       or old.paid_at is distinct from new.paid_at
       or old.status is distinct from new.status
     ) then
    raise exception 'Receptionists cannot alter settled payment facts'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger payments_prevent_receptionist_tampering
before update on public.payments
for each row execute function public.prevent_receptionist_paid_payment_tampering();

-- Replace check-in workflow to enforce the tenant attendance setting in the DB.
create or replace function public.check_in_member(
  p_tenant_id uuid,
  p_member_id uuid,
  p_prevent_duplicate_same_day boolean default true
)
returns public.attendance
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_attendance public.attendance;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_jwt_tenant uuid := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  v_timezone text;
  v_attendance_enabled boolean;
  v_today date;
begin
  if v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to record attendance for this tenant'
      using errcode = '42501';
  end if;

  select timezone, is_attendance_enabled
  into v_timezone, v_attendance_enabled
  from public.tenants
  where id = p_tenant_id;

  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;

  if not v_attendance_enabled then
    raise exception 'Attendance is disabled for this tenant' using errcode = '42501';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  if not exists (
    select 1
    from public.members
    where id = p_member_id
      and tenant_id = p_tenant_id
      and status = 'active'
  ) then
    raise exception 'Active member not found' using errcode = '23503';
  end if;

  if p_prevent_duplicate_same_day and exists (
    select 1
    from public.attendance
    where tenant_id = p_tenant_id
      and member_id = p_member_id
      and (checked_in_at at time zone v_timezone)::date = v_today
  ) then
    raise exception 'Member is already checked in today' using errcode = '23505';
  end if;

  insert into public.attendance (
    tenant_id, member_id, checked_in_at, source, recorded_by
  ) values (
    p_tenant_id, p_member_id, now(), 'reception', auth.uid()
  )
  returning * into v_attendance;

  return v_attendance;
end;
$$;

create or replace function public.verify_payment_receipt(p_payment_id uuid)
returns table (
  payment_id uuid,
  receipt_no text,
  security_code text,
  gym_name text,
  member_name text,
  member_code text,
  amount_minor bigint,
  currency text,
  payment_method public.payment_method,
  paid_at timestamptz,
  next_expiry_date date,
  is_verified boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
set timezone = 'UTC'
as $$
  select
    p.id,
    'RCT-' || upper(substr(replace(p.id::text, '-', ''), 1, 12)),
    p.receipt_security_code,
    t.name,
    m.full_name,
    m.member_code,
    p.amount_minor,
    p.currency,
    p.method,
    p.paid_at,
    m.membership_expires_on,
    (
      p.status = 'paid'
      and p.receipt_hash = encode(
        extensions.digest(
          concat_ws('|',
            p.id::text,
            p.tenant_id::text,
            p.member_id::text,
            p.amount_minor::text,
            p.currency,
            p.status::text,
            p.method::text,
            coalesce(p.paid_at::text, ''),
            p.created_at::text
          ),
          'sha256'
        ),
        'hex'
      )
    ) as is_verified
  from public.payments p
  join public.tenants t on t.id = p.tenant_id
  join public.members m on m.id = p.member_id and m.tenant_id = p.tenant_id
  where p.id = p_payment_id
    and p.status = 'paid'
    and t.status in ('trial', 'active');
$$;

revoke all on function public.set_payment_receipt_hash() from public, anon, authenticated;
revoke all on function public.enforce_member_expiry_owner_only() from public, anon, authenticated;
revoke all on function public.prevent_receptionist_paid_payment_tampering() from public, anon, authenticated;
revoke all on function public.verify_payment_receipt(uuid) from public;
grant execute on function public.verify_payment_receipt(uuid) to anon, authenticated;

commit;
