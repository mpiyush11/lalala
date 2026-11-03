begin;

create or replace function public.create_member_with_code(
  p_tenant_id uuid,
  p_full_name text,
  p_phone_number text,
  p_emergency_contact_phone text,
  p_membership_started_on date,
  p_membership_expires_on date
)
returns public.members
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_member public.members;
  v_prefix text;
  v_next_number integer;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_jwt_tenant uuid := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
begin
  if v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to create a member for this tenant'
      using errcode = '42501';
  end if;

  if char_length(btrim(p_full_name)) not between 1 and 160 then
    raise exception 'Full name is required and must not exceed 160 characters'
      using errcode = '22023';
  end if;

  if char_length(btrim(p_phone_number)) not between 7 and 20 then
    raise exception 'Phone number must contain between 7 and 20 characters'
      using errcode = '22023';
  end if;

  if p_membership_expires_on < p_membership_started_on then
    raise exception 'Membership expiry cannot precede its start date'
      using errcode = '22023';
  end if;

  -- Serialize member-code allocation per tenant to prevent duplicate codes
  -- during concurrent front-desk registrations.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  select substring(
    string_agg(substr(word, 1, 1), '' order by ordinal)
    from 1 for 4
  )
  into v_prefix
  from public.tenants t
  cross join lateral regexp_split_to_table(upper(t.name), '\s+')
    with ordinality as words(word, ordinal)
  where t.id = p_tenant_id;

  if v_prefix is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;

  select coalesce(
    max(substring(member_code from '([0-9]+)$')::integer),
    999
  ) + 1
  into v_next_number
  from public.members
  where tenant_id = p_tenant_id
    and member_code ~ ('^' || v_prefix || '-[0-9]+$');

  insert into public.members (
    tenant_id,
    member_code,
    full_name,
    phone_number,
    emergency_contact_phone,
    membership_started_on,
    membership_expires_on,
    status,
    created_by
  ) values (
    p_tenant_id,
    v_prefix || '-' || lpad(v_next_number::text, 4, '0'),
    btrim(p_full_name),
    btrim(p_phone_number),
    nullif(btrim(p_emergency_contact_phone), ''),
    p_membership_started_on,
    p_membership_expires_on,
    case
      when p_membership_expires_on >= current_date then 'active'::public.member_status
      else 'expired'::public.member_status
    end,
    auth.uid()
  )
  returning * into v_member;

  return v_member;
end;
$$;

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
  v_today date;
begin
  if v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to record attendance for this tenant'
      using errcode = '42501';
  end if;

  select timezone into v_timezone
  from public.tenants
  where id = p_tenant_id;

  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
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
    tenant_id,
    member_id,
    checked_in_at,
    source,
    recorded_by
  ) values (
    p_tenant_id,
    p_member_id,
    now(),
    'reception',
    auth.uid()
  )
  returning * into v_attendance;

  return v_attendance;
end;
$$;

create or replace function public.collect_member_payment(
  p_tenant_id uuid,
  p_member_id uuid,
  p_amount_minor bigint,
  p_method public.payment_method,
  p_notes text default null,
  p_pending_payment_id uuid default null
)
returns public.payments
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_payment public.payments;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_jwt_tenant uuid := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  v_timezone text;
  v_today date;
begin
  if v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to collect payments for this tenant'
      using errcode = '42501';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'Payment amount must be a positive integer in minor units'
      using errcode = '22023';
  end if;

  select timezone into v_timezone
  from public.tenants
  where id = p_tenant_id;

  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  if not exists (
    select 1 from public.members
    where id = p_member_id and tenant_id = p_tenant_id
  ) then
    raise exception 'Member not found' using errcode = '23503';
  end if;

  if p_pending_payment_id is not null then
    update public.payments
    set
      amount_minor = p_amount_minor,
      status = 'paid',
      method = p_method,
      paid_at = now(),
      notes = nullif(btrim(p_notes), ''),
      recorded_by = auth.uid()
    where id = p_pending_payment_id
      and tenant_id = p_tenant_id
      and member_id = p_member_id
      and status = 'pending'
    returning * into v_payment;

    if v_payment.id is null then
      raise exception 'Pending payment not found' using errcode = '23503';
    end if;
  else
    insert into public.payments (
      tenant_id,
      member_id,
      amount_minor,
      currency,
      status,
      method,
      paid_at,
      discount_minor,
      notes,
      recorded_by
    ) values (
      p_tenant_id,
      p_member_id,
      p_amount_minor,
      'INR',
      'paid',
      p_method,
      now(),
      0,
      nullif(btrim(p_notes), ''),
      auth.uid()
    )
    returning * into v_payment;
  end if;

  update public.members
  set status = case
    when membership_expires_on >= v_today then 'active'::public.member_status
    else 'expired'::public.member_status
  end
  where id = p_member_id
    and tenant_id = p_tenant_id;

  return v_payment;
end;
$$;

revoke all on function public.create_member_with_code(uuid, text, text, text, date, date)
  from public, anon;
revoke all on function public.check_in_member(uuid, uuid, boolean)
  from public, anon;
revoke all on function public.collect_member_payment(uuid, uuid, bigint, public.payment_method, text, uuid)
  from public, anon;

grant execute on function public.create_member_with_code(uuid, text, text, text, date, date)
  to authenticated;
grant execute on function public.check_in_member(uuid, uuid, boolean)
  to authenticated;
grant execute on function public.collect_member_payment(uuid, uuid, bigint, public.payment_method, text, uuid)
  to authenticated;

commit;
