begin;

-- ---------------------------------------------------------------------------
-- Audit + anti-fraud metadata on payments
-- ---------------------------------------------------------------------------
-- `recorded_by` already stores the acting staff member (auth.uid()). These
-- columns classify WHAT the staff member did and capture the justification when
-- a lapsed membership is restarted, so an owner can audit gaps later.
alter table public.payments
  add column if not exists renewal_kind text,
  add column if not exists gap_reason text,
  add column if not exists gap_days integer;

alter table public.payments
  drop constraint if exists payments_renewal_kind_check;

alter table public.payments
  add constraint payments_renewal_kind_check
  check (renewal_kind is null or renewal_kind in (
    'new_registration',
    'continuous_renewal',
    'fresh_renewal',
    'due_cleared'
  ));

-- Reason text is only meaningful on a fresh renewal that skipped a gap.
alter table public.payments
  drop constraint if exists payments_gap_reason_check;

alter table public.payments
  add constraint payments_gap_reason_check
  check (
    gap_reason is null
    or (renewal_kind = 'fresh_renewal' and char_length(btrim(gap_reason)) between 3 and 500)
  );

create index if not exists payments_recorded_by_idx
  on public.payments (tenant_id, recorded_by, created_at desc);

create index if not exists members_created_by_idx
  on public.members (tenant_id, created_by, created_at desc);

-- Tag historical rows so the staff ledger can classify them.
update public.payments
set renewal_kind = case
  when notes = 'Joining fee' then 'new_registration'
  when notes = 'Quick renew from front desk' then 'continuous_renewal'
  else 'due_cleared'
end
where renewal_kind is null;

-- ---------------------------------------------------------------------------
-- Strict renewal: start date is derived server-side, never accepted from client
-- ---------------------------------------------------------------------------
-- Backdating is the core fraud risk here: a staff member could otherwise
-- backdate a start date to hide a lapse, or forward-date to grant free time.
-- The client therefore sends only an INTENT ('continuous' | 'fresh'); this
-- function computes the actual start date from trusted server state:
--
--   continuous -> the member's existing expiry date (on-time renewal)
--   fresh      -> today in the tenant's timezone (member returning after a gap)
--
-- No calendar value from the client is honoured. A fresh renewal that skips a
-- real gap additionally requires a written reason, recorded for admin review.
create or replace function public.renew_member_plan(
  p_tenant_id uuid,
  p_member_id uuid,
  p_amount_minor bigint,
  p_method public.payment_method,
  p_duration_days integer,
  p_start_mode text,
  p_gap_reason text default null
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
  v_start date;
  v_new_expiry date;
  v_gap_days integer;
  v_reason text := nullif(btrim(p_gap_reason), '');
begin
  if v_jwt_tenant is null
     or v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to renew members for this tenant'
      using errcode = '42501';
  end if;

  if p_start_mode not in ('continuous', 'fresh') then
    raise exception 'Start mode must be continuous or fresh'
      using errcode = '22023';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'Renewal amount must be a positive integer in minor units'
      using errcode = '22023';
  end if;

  if p_duration_days is null or p_duration_days <= 0 or p_duration_days > 3660 then
    raise exception 'Plan duration must be between 1 and 3660 days'
      using errcode = '22023';
  end if;

  select timezone into v_timezone
  from public.tenants
  where id = p_tenant_id;

  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  select membership_expires_on into v_current_expiry
  from public.members
  where id = p_member_id
    and tenant_id = p_tenant_id;

  if v_current_expiry is null then
    raise exception 'Member not found' using errcode = '23503';
  end if;

  if p_start_mode = 'continuous' then
    -- A continuous renewal only makes sense while the plan is still running.
    -- Allowing it on a lapsed plan would silently gift the missed days back.
    if v_current_expiry < v_today then
      raise exception 'Membership already lapsed; use a fresh renewal starting today'
        using errcode = '22023';
    end if;

    v_start := v_current_expiry;
    v_gap_days := 0;
  else
    v_start := v_today;
    v_gap_days := greatest(0, v_today - v_current_expiry);

    -- A genuine gap must be explained; this is the admin review trail.
    if v_gap_days > 0 and v_reason is null then
      raise exception 'A reason for the membership gap is required'
        using errcode = '22023';
    end if;
  end if;

  v_new_expiry := v_start + p_duration_days;

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
    renewal_kind,
    gap_reason,
    gap_days,
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
    v_start,
    v_new_expiry,
    case when p_start_mode = 'fresh' then 'fresh_renewal' else 'continuous_renewal' end,
    case when p_start_mode = 'fresh' and v_gap_days > 0 then v_reason else null end,
    v_gap_days,
    'Plan renewal',
    auth.uid()
  )
  returning * into v_payment;

  update public.members
  set
    membership_started_on = v_start,
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

revoke all on function public.renew_member_plan(uuid, uuid, bigint, public.payment_method, integer, text, text) from public, anon;
grant execute on function public.renew_member_plan(uuid, uuid, bigint, public.payment_method, integer, text, text) to authenticated;

-- Tag settled dues so the staff ledger can distinguish them from renewals.
create or replace function public.settle_member_due(
  p_tenant_id uuid,
  p_member_id uuid,
  p_pending_payment_id uuid,
  p_amount_minor bigint,
  p_method public.payment_method,
  p_notes text default null
)
returns public.payments
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_payment public.payments;
begin
  -- SECURITY INVOKER: RLS applies, so a cross-tenant pending id simply will not
  -- be visible to update.
  update public.payments
  set
    amount_minor = p_amount_minor,
    status = 'paid',
    method = p_method,
    paid_at = now(),
    renewal_kind = 'due_cleared',
    notes = coalesce(nullif(btrim(p_notes), ''), notes),
    recorded_by = auth.uid()
  where id = p_pending_payment_id
    and tenant_id = p_tenant_id
    and member_id = p_member_id
    and status = 'pending'
  returning * into v_payment;

  if v_payment.id is null then
    raise exception 'Pending due not found' using errcode = '23503';
  end if;

  return v_payment;
end;
$$;

revoke all on function public.settle_member_due(uuid, uuid, uuid, bigint, public.payment_method, text) from public, anon;
grant execute on function public.settle_member_due(uuid, uuid, uuid, bigint, public.payment_method, text) to authenticated;

commit;
