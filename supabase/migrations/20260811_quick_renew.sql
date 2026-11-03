begin;

-- One-click renewal for the front desk.
--
-- Renewal is two facts in one atomic operation: a settled payment, and an
-- extended membership expiry. A receptionist is permitted to perform the
-- combined workflow, but is deliberately NOT permitted to move
-- `membership_expires_on` by hand -- `members_expiry_owner_only` blocks that.
--
-- This function is therefore SECURITY DEFINER so the expiry write executes as
-- the function owner and satisfies that trigger. Because SECURITY DEFINER
-- bypasses RLS, every tenant and role check is re-asserted explicitly below
-- against the verified JWT. Client input is never trusted for tenant identity:
-- `p_tenant_id` must equal the tenant baked into `app_metadata`.
create or replace function public.quick_renew_member(
  p_tenant_id uuid,
  p_member_id uuid,
  p_amount_minor bigint,
  p_method public.payment_method,
  p_extend_days integer default 30,
  p_notes text default null
)
returns public.payments
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_payment public.payments;
  v_timezone text;
  v_today date;
  v_current_expiry date;
  v_new_expiry date;
begin
  -- Tenant identity and role come from the verified JWT only.
  if v_jwt_tenant is null
     or v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to renew members for this tenant'
      using errcode = '42501';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'Renewal amount must be a positive integer in minor units'
      using errcode = '22023';
  end if;

  if p_extend_days is null or p_extend_days <= 0 or p_extend_days > 3660 then
    raise exception 'Renewal duration must be between 1 and 3660 days'
      using errcode = '22023';
  end if;

  select timezone into v_timezone
  from public.tenants
  where id = p_tenant_id;

  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  -- Tenant-scoped member lookup; a cross-tenant id cannot resolve here.
  select membership_expires_on into v_current_expiry
  from public.members
  where id = p_member_id
    and tenant_id = p_tenant_id;

  if v_current_expiry is null then
    raise exception 'Member not found' using errcode = '23503';
  end if;

  -- Renewing an already-active plan appends to the remaining term; renewing a
  -- lapsed plan starts from today so the member never receives free backdated
  -- days.
  v_new_expiry := greatest(v_current_expiry, v_today) + p_extend_days;

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
    p_member_id,
    p_amount_minor,
    'INR',
    'paid',
    p_method,
    now(),
    0,
    greatest(v_current_expiry, v_today),
    v_new_expiry,
    nullif(btrim(p_notes), ''),
    auth.uid()
  )
  returning * into v_payment;

  update public.members
  set
    membership_expires_on = v_new_expiry,
    status = case
      when v_new_expiry >= v_today then 'active'::public.member_status
      else 'expired'::public.member_status
    end
  where id = p_member_id
    and tenant_id = p_tenant_id;

  return v_payment;
end;
$$;

revoke all on function public.quick_renew_member(uuid, uuid, bigint, public.payment_method, integer, text) from public, anon;
grant execute on function public.quick_renew_member(uuid, uuid, bigint, public.payment_method, integer, text) to authenticated;

commit;
