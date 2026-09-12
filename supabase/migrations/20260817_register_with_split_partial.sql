begin;

-- ---------------------------------------------------------------------------
-- Registration with split tender + partial balance parity.
-- ---------------------------------------------------------------------------
-- The collect screen already supports Cash/UPI/Split and partial dues via
-- `collect_split_payment`. Registration lagged behind with a single-method
-- dropdown, so a member joining with a part payment could not be recorded
-- correctly. This brings onboarding to full parity.
--
-- SECURITY DEFINER: the freshly inserted member row must be readable to attach
-- the payment inside the same transaction, and the rolling balance is written
-- directly. Tenant and role are therefore re-asserted from the verified JWT --
-- `p_tenant_id` is never trusted on its own.
create or replace function public.register_member_split_payment(
  p_tenant_id uuid,
  p_full_name text,
  p_phone_number text,
  p_membership_started_on date,
  p_membership_expires_on date,
  p_total_due_minor bigint,
  p_cash_minor bigint default 0,
  p_upi_minor bigint default 0,
  p_due_settlement_date date default null
)
returns table (
  member_id uuid,
  member_code text,
  payment_id uuid,
  balance_due_minor bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_member public.members;
  v_payment public.payments;
  v_prefix text;
  v_next_number integer;
  v_paid bigint := coalesce(p_cash_minor, 0) + coalesce(p_upi_minor, 0);
  v_balance bigint;
  v_method public.payment_method;
  v_timezone text;
  v_today date;
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

  if coalesce(p_cash_minor, 0) < 0 or coalesce(p_upi_minor, 0) < 0 then
    raise exception 'Tender amounts cannot be negative' using errcode = '22023';
  end if;

  if p_total_due_minor is null or p_total_due_minor < 0 then
    raise exception 'Total payable cannot be negative' using errcode = '22023';
  end if;

  -- Overpayment is always a data-entry error rather than a legitimate state.
  if v_paid > p_total_due_minor then
    raise exception 'Paid amount cannot exceed the total payable'
      using errcode = '22023';
  end if;

  v_balance := p_total_due_minor - v_paid;

  if v_balance > 0 and p_due_settlement_date is null then
    raise exception 'A due settlement date is required for partial payments'
      using errcode = '22023';
  end if;

  select timezone into v_timezone from public.tenants where id = p_tenant_id;
  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;
  v_today := (now() at time zone v_timezone)::date;

  if v_balance > 0 and p_due_settlement_date < v_today then
    raise exception 'Due settlement date cannot be in the past' using errcode = '22023';
  end if;

  -- Serialize member-code allocation per tenant to prevent duplicate codes
  -- during concurrent front-desk registrations.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  select substring(
    string_agg(substr(word, 1, 1), '' order by ordinal) from 1 for 4
  )
  into v_prefix
  from public.tenants t
  cross join lateral regexp_split_to_table(upper(t.name), '\s+')
    with ordinality as words(word, ordinal)
  where t.id = p_tenant_id;

  select coalesce(max(substring(m.member_code from '([0-9]+)$')::integer), 999) + 1
  into v_next_number
  from public.members m
  where m.tenant_id = p_tenant_id
    and m.member_code ~ ('^' || v_prefix || '-[0-9]+$');

  insert into public.members (
    tenant_id, member_code, full_name, phone_number,
    membership_started_on, membership_expires_on, status,
    balance_due_minor, created_by
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
    v_balance,
    auth.uid()
  )
  returning * into v_member;

  -- A zero tender is legitimate (comp/trial); skip the payment row so the
  -- ledger never shows a misleading ₹0 receipt.
  if v_paid > 0 then
    v_method := case
      when coalesce(p_cash_minor, 0) > 0 and coalesce(p_upi_minor, 0) > 0 then 'cash'
      when coalesce(p_upi_minor, 0) > 0 then 'upi'
      else 'cash'
    end::public.payment_method;

    insert into public.payments (
      tenant_id, member_id, amount_minor, currency, status, method, paid_at,
      discount_minor, cash_minor, upi_minor, total_due_minor, balance_due_minor,
      due_settlement_date, period_starts_on, period_ends_on, renewal_kind,
      notes, recorded_by
    ) values (
      p_tenant_id, v_member.id, v_paid, 'INR',
      case when v_balance > 0 then 'pending' else 'paid' end::public.payment_status,
      v_method, now(), 0,
      coalesce(p_cash_minor, 0), coalesce(p_upi_minor, 0),
      p_total_due_minor, v_balance, p_due_settlement_date,
      p_membership_started_on, p_membership_expires_on,
      'new_registration', 'Joining fee', auth.uid()
    )
    returning * into v_payment;
  end if;

  member_id := v_member.id;
  member_code := v_member.member_code;
  payment_id := v_payment.id;
  balance_due_minor := v_balance;
  return next;
end;
$$;

revoke all on function public.register_member_split_payment(uuid, text, text, date, date, bigint, bigint, bigint, date) from public, anon;
grant execute on function public.register_member_split_payment(uuid, text, text, date, date, bigint, bigint, bigint, date) to authenticated;

commit;
