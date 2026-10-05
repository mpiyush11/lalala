begin;

-- Fast front-desk onboarding: create the member and record the agreed joining
-- fee as one atomic unit.
--
-- Previously the desk had to create a member, then navigate away and collect a
-- payment separately -- two round trips that could leave a member with no
-- payment record if the second step was abandoned.
--
-- Emergency contact is intentionally not a parameter: the streamlined form
-- collects only Full Name and Phone.
--
-- SECURITY DEFINER is required because the freshly inserted member row must be
-- readable to attach the payment within the same transaction, and because the
-- expiry is set directly. RLS is therefore bypassed, so tenant and role are
-- re-verified below from the verified JWT only -- `p_tenant_id` must match the
-- tenant baked into app_metadata. Client input is never trusted for identity.
create or replace function public.register_member_with_payment(
  p_tenant_id uuid,
  p_full_name text,
  p_phone_number text,
  p_membership_started_on date,
  p_membership_expires_on date,
  p_amount_minor bigint default 0,
  p_method public.payment_method default 'cash'
)
returns table (
  member_id uuid,
  member_code text,
  payment_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_member public.members;
  v_payment public.payments;
  v_prefix text;
  v_next_number integer;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_today date;
  v_timezone text;
begin
  if v_jwt_tenant is null
     or v_jwt_tenant is distinct from p_tenant_id
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

  -- A negative fee would silently corrupt shift totals.
  if p_amount_minor < 0 then
    raise exception 'Agreed amount cannot be negative'
      using errcode = '22023';
  end if;

  select timezone into v_timezone
  from public.tenants
  where id = p_tenant_id;

  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;

  v_today := (now() at time zone v_timezone)::date;

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

  select coalesce(
    max(substring(m.member_code from '([0-9]+)$')::integer),
    999
  ) + 1
  into v_next_number
  from public.members m
  where m.tenant_id = p_tenant_id
    and m.member_code ~ ('^' || v_prefix || '-[0-9]+$');

  insert into public.members (
    tenant_id,
    member_code,
    full_name,
    phone_number,
    membership_started_on,
    membership_expires_on,
    status,
    created_by
  ) values (
    p_tenant_id,
    v_prefix || '-' || lpad(v_next_number::text, 4, '0'),
    btrim(p_full_name),
    btrim(p_phone_number),
    p_membership_started_on,
    p_membership_expires_on,
    case
      when p_membership_expires_on >= v_today then 'active'::public.member_status
      else 'expired'::public.member_status
    end,
    auth.uid()
  )
  returning * into v_member;

  -- A zero fee is legitimate (comp/trial membership): create the profile with
  -- no payment row rather than a misleading zero-value receipt.
  if p_amount_minor > 0 then
    insert into public.payments (
      tenant_id,
      member_id,
      amount_minor,
      currency,
      status,
      method,
      paid_at,
      discount_minor,
      period_starts_on,
      period_ends_on,
      notes,
      recorded_by
    ) values (
      p_tenant_id,
      v_member.id,
      p_amount_minor,
      'INR',
      'paid',
      p_method,
      now(),
      0,
      p_membership_started_on,
      p_membership_expires_on,
      'Joining fee',
      auth.uid()
    )
    returning * into v_payment;
  end if;

  member_id := v_member.id;
  member_code := v_member.member_code;
  payment_id := v_payment.id;
  return next;
end;
$$;

revoke all on function public.register_member_with_payment(uuid, text, text, date, date, bigint, public.payment_method) from public, anon;
grant execute on function public.register_member_with_payment(uuid, text, text, date, date, bigint, public.payment_method) to authenticated;

commit;
