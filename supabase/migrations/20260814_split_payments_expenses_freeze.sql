begin;

-- ===========================================================================
-- MODULE 1 — Split tender + partial dues
-- ===========================================================================
-- A single payment can now be tendered partly in cash and partly by UPI, and
-- may settle only part of the agreed fee. `method` is retained for backwards
-- compatibility (set to the dominant tender) while the split is recorded
-- explicitly so shift reconciliation stays exact.
alter table public.payments
  add column if not exists cash_minor bigint not null default 0,
  add column if not exists upi_minor bigint not null default 0,
  add column if not exists total_due_minor bigint,
  add column if not exists balance_due_minor bigint not null default 0,
  add column if not exists due_settlement_date date;

alter table public.payments
  drop constraint if exists payments_split_non_negative_check;

alter table public.payments
  add constraint payments_split_non_negative_check
  check (cash_minor >= 0 and upi_minor >= 0 and balance_due_minor >= 0);

-- A balance can only exist when the tender falls short of the agreed total.
alter table public.payments
  drop constraint if exists payments_balance_requires_date_check;

alter table public.payments
  add constraint payments_balance_requires_date_check
  check (balance_due_minor = 0 or due_settlement_date is not null);

alter table public.members
  add column if not exists balance_due_minor bigint not null default 0;

alter table public.members
  drop constraint if exists members_balance_due_non_negative_check;

alter table public.members
  add constraint members_balance_due_non_negative_check
  check (balance_due_minor >= 0);

-- ===========================================================================
-- MODULE 2 — Petty expense / drawer cash-out
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'expense_category') then
    create type public.expense_category as enum (
      'water_camper',
      'housekeeping',
      'staff_advance',
      'repairs',
      'other'
    );
  end if;
end
$$;

create table if not exists public.expenses (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  category public.expense_category not null,
  note text,
  spent_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists expenses_tenant_spent_at_idx
  on public.expenses (tenant_id, spent_at desc);

alter table public.expenses enable row level security;
alter table public.expenses force row level security;

drop policy if exists expenses_select_same_tenant on public.expenses;
create policy expenses_select_same_tenant on public.expenses
  for select to authenticated
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

drop policy if exists expenses_insert_same_tenant on public.expenses;
create policy expenses_insert_same_tenant on public.expenses
  for insert to authenticated
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('receptionist', 'owner')
    and recorded_by = auth.uid()
  );

drop policy if exists expenses_update_same_tenant on public.expenses;
create policy expenses_update_same_tenant on public.expenses
  for update to authenticated
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Consistent with members/payments/attendance: only an owner may delete.
drop policy if exists expenses_delete_owner_only on public.expenses;
create policy expenses_delete_owner_only on public.expenses
  for delete to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

-- ===========================================================================
-- MODULE 3 — Membership freeze / pause
-- ===========================================================================
alter table public.members
  add column if not exists freeze_started_on date,
  add column if not exists freeze_resumes_on date,
  add column if not exists freeze_reason text;

create table if not exists public.member_freezes (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  freeze_started_on date not null,
  freeze_resumes_on date not null,
  frozen_days integer not null check (frozen_days > 0 and frozen_days <= 30),
  reason text not null,
  previous_expiry date not null,
  new_expiry date not null,
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists member_freezes_tenant_member_idx
  on public.member_freezes (tenant_id, member_id, created_at desc);

alter table public.member_freezes enable row level security;
alter table public.member_freezes force row level security;

drop policy if exists member_freezes_select_same_tenant on public.member_freezes;
create policy member_freezes_select_same_tenant on public.member_freezes
  for select to authenticated
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

drop policy if exists member_freezes_delete_owner_only on public.member_freezes;
create policy member_freezes_delete_owner_only on public.member_freezes
  for delete to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

-- ---------------------------------------------------------------------------
-- Collect a payment with split tender and optional partial balance.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because a partial payment must also write the member's
-- rolling balance. Tenant and role are therefore re-asserted from the verified
-- JWT; `p_tenant_id` is never trusted on its own.
create or replace function public.collect_split_payment(
  p_tenant_id uuid,
  p_member_id uuid,
  p_total_due_minor bigint,
  p_cash_minor bigint,
  p_upi_minor bigint,
  p_duration_days integer default null,
  p_start_mode text default null,
  p_gap_reason text default null,
  p_due_settlement_date date default null,
  p_pending_payment_id uuid default null
)
returns public.payments
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_paid bigint := coalesce(p_cash_minor, 0) + coalesce(p_upi_minor, 0);
  v_balance bigint;
  v_method public.payment_method;
  v_payment public.payments;
  v_timezone text;
  v_today date;
  v_current_expiry date;
  v_start date;
  v_new_expiry date;
begin
  if v_jwt_tenant is null
     or v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to collect payments for this tenant'
      using errcode = '42501';
  end if;

  if coalesce(p_cash_minor, 0) < 0 or coalesce(p_upi_minor, 0) < 0 then
    raise exception 'Tender amounts cannot be negative' using errcode = '22023';
  end if;

  if v_paid <= 0 then
    raise exception 'Paid amount must be greater than zero' using errcode = '22023';
  end if;

  if p_total_due_minor is null or p_total_due_minor <= 0 then
    raise exception 'Total payable must be greater than zero' using errcode = '22023';
  end if;

  -- Overpayment is always a data-entry error; reject rather than silently
  -- creating a negative balance.
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

  select membership_expires_on into v_current_expiry
  from public.members
  where id = p_member_id and tenant_id = p_tenant_id;

  if v_current_expiry is null then
    raise exception 'Member not found' using errcode = '23503';
  end if;

  -- Dominant tender keeps legacy single-method reporting meaningful.
  v_method := case
    when coalesce(p_cash_minor, 0) > 0 and coalesce(p_upi_minor, 0) > 0 then 'cash'
    when coalesce(p_upi_minor, 0) > 0 then 'upi'
    else 'cash'
  end::public.payment_method;

  if p_pending_payment_id is not null then
    update public.payments
    set
      amount_minor = v_paid,
      cash_minor = coalesce(p_cash_minor, 0),
      upi_minor = coalesce(p_upi_minor, 0),
      total_due_minor = p_total_due_minor,
      balance_due_minor = v_balance,
      due_settlement_date = p_due_settlement_date,
      status = case when v_balance > 0 then 'pending' else 'paid' end::public.payment_status,
      method = v_method,
      paid_at = now(),
      renewal_kind = 'due_cleared',
      recorded_by = auth.uid()
    where id = p_pending_payment_id
      and tenant_id = p_tenant_id
      and member_id = p_member_id
    returning * into v_payment;

    if v_payment.id is null then
      raise exception 'Pending due not found' using errcode = '23503';
    end if;
  else
    if p_duration_days is not null then
      if p_start_mode not in ('continuous', 'fresh') then
        raise exception 'Start mode must be continuous or fresh' using errcode = '22023';
      end if;

      if p_start_mode = 'continuous' then
        if v_current_expiry < v_today then
          raise exception 'Membership already lapsed; use a fresh renewal starting today'
            using errcode = '22023';
        end if;
        v_start := v_current_expiry;
      else
        v_start := v_today;
      end if;

      v_new_expiry := v_start + p_duration_days;
    end if;

    insert into public.payments (
      tenant_id, member_id, amount_minor, currency, status, method, paid_at,
      discount_minor, cash_minor, upi_minor, total_due_minor, balance_due_minor,
      due_settlement_date, period_starts_on, period_ends_on, renewal_kind,
      gap_reason, notes, recorded_by
    ) values (
      p_tenant_id, p_member_id, v_paid, 'INR',
      case when v_balance > 0 then 'pending' else 'paid' end::public.payment_status,
      v_method, now(), 0, coalesce(p_cash_minor, 0), coalesce(p_upi_minor, 0),
      p_total_due_minor, v_balance, p_due_settlement_date, v_start, v_new_expiry,
      case
        when p_duration_days is null then 'due_cleared'
        when p_start_mode = 'fresh' then 'fresh_renewal'
        else 'continuous_renewal'
      end,
      nullif(btrim(p_gap_reason), ''), 'Collected at front desk', auth.uid()
    )
    returning * into v_payment;
  end if;

  update public.members
  set
    balance_due_minor = greatest(0, balance_due_minor + v_balance
      - case when p_pending_payment_id is not null then p_total_due_minor else 0 end),
    membership_expires_on = coalesce(v_new_expiry, membership_expires_on),
    membership_started_on = coalesce(v_start, membership_started_on),
    status = case
      when status = 'paused' then status
      when coalesce(v_new_expiry, membership_expires_on) >= v_today
        then 'active'::public.member_status
      else 'expired'::public.member_status
    end
  where id = p_member_id and tenant_id = p_tenant_id;

  return v_payment;
end;
$$;

revoke all on function public.collect_split_payment(uuid, uuid, bigint, bigint, bigint, integer, text, text, date, uuid) from public, anon;
grant execute on function public.collect_split_payment(uuid, uuid, bigint, bigint, bigint, integer, text, text, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Freeze a membership and extend expiry by exactly the frozen day count.
-- ---------------------------------------------------------------------------
create or replace function public.freeze_member_plan(
  p_tenant_id uuid,
  p_member_id uuid,
  p_freeze_start date,
  p_resume_on date,
  p_reason text
)
returns public.members
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_member public.members;
  v_days integer;
  v_new_expiry date;
  v_timezone text;
  v_today date;
begin
  if v_jwt_tenant is null
     or v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to freeze members for this tenant'
      using errcode = '42501';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'A freeze reason is required' using errcode = '22023';
  end if;

  select timezone into v_timezone from public.tenants where id = p_tenant_id;
  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;
  v_today := (now() at time zone v_timezone)::date;

  select * into v_member
  from public.members
  where id = p_member_id and tenant_id = p_tenant_id;

  if v_member.id is null then
    raise exception 'Member not found' using errcode = '23503';
  end if;

  -- Only a running membership can be frozen; freezing an expired or already
  -- paused plan would gift unearned days.
  if v_member.status <> 'active' then
    raise exception 'Only an active membership can be frozen' using errcode = '22023';
  end if;

  if p_freeze_start < v_today then
    raise exception 'Freeze cannot start in the past' using errcode = '22023';
  end if;

  v_days := p_resume_on - p_freeze_start;

  if v_days <= 0 then
    raise exception 'Resume date must be after the freeze start date' using errcode = '22023';
  end if;

  if v_days > 30 then
    raise exception 'A freeze cannot exceed 30 days' using errcode = '22023';
  end if;

  v_new_expiry := v_member.membership_expires_on + v_days;

  update public.members
  set
    status = 'paused'::public.member_status,
    membership_expires_on = v_new_expiry,
    freeze_started_on = p_freeze_start,
    freeze_resumes_on = p_resume_on,
    freeze_reason = btrim(p_reason)
  where id = p_member_id and tenant_id = p_tenant_id
  returning * into v_member;

  insert into public.member_freezes (
    tenant_id, member_id, freeze_started_on, freeze_resumes_on, frozen_days,
    reason, previous_expiry, new_expiry, recorded_by
  ) values (
    p_tenant_id, p_member_id, p_freeze_start, p_resume_on, v_days,
    btrim(p_reason), v_new_expiry - v_days, v_new_expiry, auth.uid()
  );

  return v_member;
end;
$$;

revoke all on function public.freeze_member_plan(uuid, uuid, date, date, text) from public, anon;
grant execute on function public.freeze_member_plan(uuid, uuid, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-resume: flip paused members back to active on/after their resume date.
-- ---------------------------------------------------------------------------
create or replace function public.resume_due_memberships(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_timezone text;
  v_today date;
  v_count integer;
begin
  if v_jwt_tenant is null or v_jwt_tenant is distinct from p_tenant_id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select timezone into v_timezone from public.tenants where id = p_tenant_id;
  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;
  v_today := (now() at time zone v_timezone)::date;

  with resumed as (
    update public.members
    set
      status = case
        when membership_expires_on >= v_today then 'active'::public.member_status
        else 'expired'::public.member_status
      end,
      freeze_started_on = null,
      freeze_resumes_on = null,
      freeze_reason = null
    where tenant_id = p_tenant_id
      and status = 'paused'
      and freeze_resumes_on is not null
      and freeze_resumes_on <= v_today
    returning 1
  )
  select count(*) into v_count from resumed;

  return v_count;
end;
$$;

revoke all on function public.resume_due_memberships(uuid) from public, anon;
grant execute on function public.resume_due_memberships(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Check-in must refuse paused members with an actionable message.
-- ---------------------------------------------------------------------------
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
  v_status public.member_status;
  v_resumes date;
begin
  if v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to record attendance for this tenant'
      using errcode = '42501';
  end if;

  select timezone into v_timezone from public.tenants where id = p_tenant_id;
  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;

  if not (select is_attendance_enabled from public.tenants where id = p_tenant_id) then
    raise exception 'Attendance module is disabled for this gym' using errcode = '22023';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  select status, freeze_resumes_on into v_status, v_resumes
  from public.members
  where id = p_member_id and tenant_id = p_tenant_id;

  if v_status is null then
    raise exception 'Member not found' using errcode = '23503';
  end if;

  -- Paused members are blocked with a distinct code so the desk can surface a
  -- "Reactivate now" prompt rather than a generic failure.
  if v_status = 'paused' then
    raise exception 'Membership paused until %', to_char(coalesce(v_resumes, v_today), 'DD Mon YYYY')
      using errcode = 'P0001';
  end if;

  if v_status <> 'active' then
    raise exception 'Active member not found' using errcode = '23503';
  end if;

  if p_prevent_duplicate_same_day and exists (
    select 1 from public.attendance
    where tenant_id = p_tenant_id
      and member_id = p_member_id
      and (checked_in_at at time zone v_timezone)::date = v_today
  ) then
    raise exception 'Member is already checked in today' using errcode = '23505';
  end if;

  insert into public.attendance (tenant_id, member_id, checked_in_at, source, recorded_by)
  values (p_tenant_id, p_member_id, now(), 'reception', auth.uid())
  returning * into v_attendance;

  return v_attendance;
end;
$$;

commit;
-- A freeze start "today" in the browser can lag the tenant-local date across
-- the IST boundary. Clamp to the tenant's today instead of rejecting.
create or replace function public.freeze_member_plan(
  p_tenant_id uuid, p_member_id uuid, p_freeze_start date,
  p_resume_on date, p_reason text
)
returns public.members
language plpgsql security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id','')::uuid;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_member public.members; v_days integer; v_new_expiry date;
  v_timezone text; v_today date; v_start date;
begin
  if v_jwt_tenant is null or v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist','owner') then
    raise exception 'Not authorized to freeze members for this tenant' using errcode='42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'A freeze reason is required' using errcode='22023';
  end if;
  select timezone into v_timezone from public.tenants where id = p_tenant_id;
  if v_timezone is null then raise exception 'Tenant not found' using errcode='23503'; end if;
  v_today := (now() at time zone v_timezone)::date;

  select * into v_member from public.members
  where id = p_member_id and tenant_id = p_tenant_id;
  if v_member.id is null then raise exception 'Member not found' using errcode='23503'; end if;
  if v_member.status <> 'active' then
    raise exception 'Only an active membership can be frozen' using errcode='22023';
  end if;

  -- Tolerate a one-day clock lag; anything older is a genuine backdate attempt.
  v_start := greatest(coalesce(p_freeze_start, v_today), v_today);
  if p_freeze_start is not null and p_freeze_start < v_today - 1 then
    raise exception 'Freeze cannot start in the past' using errcode='22023';
  end if;

  v_days := p_resume_on - v_start;
  if v_days <= 0 then
    raise exception 'Resume date must be after the freeze start date' using errcode='22023';
  end if;
  if v_days > 30 then
    raise exception 'A freeze cannot exceed 30 days' using errcode='22023';
  end if;

  v_new_expiry := v_member.membership_expires_on + v_days;

  update public.members set
    status='paused'::public.member_status, membership_expires_on=v_new_expiry,
    freeze_started_on=v_start, freeze_resumes_on=p_resume_on, freeze_reason=btrim(p_reason)
  where id=p_member_id and tenant_id=p_tenant_id returning * into v_member;

  insert into public.member_freezes (tenant_id,member_id,freeze_started_on,freeze_resumes_on,
    frozen_days,reason,previous_expiry,new_expiry,recorded_by)
  values (p_tenant_id,p_member_id,v_start,p_resume_on,v_days,btrim(p_reason),
    v_new_expiry - v_days, v_new_expiry, auth.uid());

  return v_member;
end;
$$;
