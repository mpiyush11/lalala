begin;

-- ===========================================================================
-- PHASE 2 — STEP 1: Owner Cockpit foundation
-- ===========================================================================
-- SCHEMA RECONCILIATION NOTE
-- The brief refers to `gyms(id)` and `plans`. Neither exists in this codebase:
-- tenancy is `public.tenants` (keyed by `tenant_id`) and membership plans are a
-- client-side catalogue in `src/lib/plans.ts`, materialised per payment via
-- `period_starts_on` / `period_ends_on`. Rather than invent tables that nothing
-- reads, this migration binds to the real schema:
--
--   gyms(id)          -> public.tenants(tenant_id)
--   users(id)         -> public.users(id)  (mirrors auth.users)
--   plans.is_pt_plan  -> public.payments.is_pt_plan  (per-sale PT flag)
--   payments.security_hash / receipt_number
--                     -> payments.receipt_hash / receipt_security_code
--
-- Everything below is idempotent and additive; no Phase 1 column or row is
-- altered destructively.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1.1 shifts — desk handover + drawer reconciliation
-- ---------------------------------------------------------------------------
create table if not exists public.shifts (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  staff_id uuid not null references public.users (id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash_minor bigint not null default 0,
  system_cash_in_minor bigint not null default 0,
  petty_expenses_minor bigint not null default 0,
  actual_cash_minor bigint,
  variance_minor bigint,
  status text not null default 'OPEN',
  notes text,
  created_at timestamptz not null default now()
);

alter table public.shifts drop constraint if exists shifts_status_check;
alter table public.shifts
  add constraint shifts_status_check
  check (status in ('OPEN', 'HANDED_OVER', 'LOCKED'));

-- A locked shift must carry its reconciliation figures.
alter table public.shifts drop constraint if exists shifts_locked_requires_count_check;
alter table public.shifts
  add constraint shifts_locked_requires_count_check
  check (status <> 'LOCKED' or (actual_cash_minor is not null and closed_at is not null));

create index if not exists shifts_tenant_status_idx
  on public.shifts (tenant_id, status, opened_at desc);

-- At most one OPEN shift per staff member; a second would split the drawer.
create unique index if not exists shifts_one_open_per_staff_idx
  on public.shifts (tenant_id, staff_id)
  where status = 'OPEN';

alter table public.shifts enable row level security;
alter table public.shifts force row level security;

drop policy if exists shifts_select_same_tenant on public.shifts;
create policy shifts_select_same_tenant on public.shifts
  for select to authenticated
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

drop policy if exists shifts_insert_same_tenant on public.shifts;
create policy shifts_insert_same_tenant on public.shifts
  for insert to authenticated
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('receptionist', 'owner')
  );

-- A LOCKED shift is an immutable audit record: no role may edit it in place.
drop policy if exists shifts_update_unlocked_only on public.shifts;
create policy shifts_update_unlocked_only on public.shifts
  for update to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and status <> 'LOCKED'
  )
  with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

drop policy if exists shifts_delete_owner_only on public.shifts;
create policy shifts_delete_owner_only on public.shifts
  for delete to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
    and status <> 'LOCKED'
  );

-- ---------------------------------------------------------------------------
-- 1.2 expenses — owner approval workflow
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column if not exists status text not null default 'PENDING_APPROVAL',
  add column if not exists approved_by_user_id uuid references public.users (id),
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists shift_id uuid references public.shifts (id) on delete set null;

alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses
  add constraint expenses_status_check
  check (status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED'));

-- A rejection must be explained; an approval must record who signed it off.
alter table public.expenses drop constraint if exists expenses_review_metadata_check;
alter table public.expenses
  add constraint expenses_review_metadata_check
  check (
    (status <> 'REJECTED' or char_length(btrim(coalesce(rejection_reason, ''))) >= 3)
    and (status <> 'APPROVED' or approved_by_user_id is not null)
  );

create index if not exists expenses_tenant_status_idx
  on public.expenses (tenant_id, status, spent_at desc);

-- Backfill: legacy expenses predate approval and already count toward the
-- drawer, so they are treated as approved by their tenant's owner.
update public.expenses e
set
  status = 'APPROVED',
  approved_by_user_id = coalesce(
    e.approved_by_user_id,
    (select u.id from public.users u
      where u.tenant_id = e.tenant_id and u.role = 'owner'
      order by u.created_at limit 1)
  ),
  approved_at = coalesce(e.approved_at, e.created_at)
where e.status = 'PENDING_APPROVAL'
  and e.created_at < now();

-- ---------------------------------------------------------------------------
-- 1.3 trainers & PT commission
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists assigned_trainer_id uuid references public.users (id) on delete set null;

create index if not exists members_assigned_trainer_idx
  on public.members (tenant_id, assigned_trainer_id);

alter table public.users
  add column if not exists commission_rate_pct numeric(5, 2) not null default 0.00;

alter table public.users drop constraint if exists users_commission_rate_range_check;
alter table public.users
  add constraint users_commission_rate_range_check
  check (commission_rate_pct >= 0 and commission_rate_pct <= 100);

-- No `plans` table exists; PT is a property of the sale, so the flag lives on
-- the payment that materialises the plan.
alter table public.payments
  add column if not exists is_pt_plan boolean not null default false;

create table if not exists public.trainer_payouts (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  trainer_id uuid not null references public.users (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  period_start date not null,
  period_end date not null,
  paid_at timestamptz not null default now(),
  payment_mode text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.trainer_payouts drop constraint if exists trainer_payouts_mode_check;
alter table public.trainer_payouts
  add constraint trainer_payouts_mode_check
  check (payment_mode in ('CASH', 'UPI', 'BANK_TRANSFER'));

alter table public.trainer_payouts drop constraint if exists trainer_payouts_period_check;
alter table public.trainer_payouts
  add constraint trainer_payouts_period_check
  check (period_end >= period_start);

create index if not exists trainer_payouts_tenant_trainer_idx
  on public.trainer_payouts (tenant_id, trainer_id, period_end desc);

alter table public.trainer_payouts enable row level security;
alter table public.trainer_payouts force row level security;

-- Payout amounts are owner-only financial data; a receptionist must not read
-- or write them.
drop policy if exists trainer_payouts_select_owner on public.trainer_payouts;
create policy trainer_payouts_select_owner on public.trainer_payouts
  for select to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
      or trainer_id = auth.uid()
    )
  );

drop policy if exists trainer_payouts_write_owner on public.trainer_payouts;
create policy trainer_payouts_write_owner on public.trainer_payouts
  for insert to authenticated
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

drop policy if exists trainer_payouts_update_owner on public.trainer_payouts;
create policy trainer_payouts_update_owner on public.trainer_payouts
  for update to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  )
  with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

drop policy if exists trainer_payouts_delete_owner on public.trainer_payouts;
create policy trainer_payouts_delete_owner on public.trainer_payouts
  for delete to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

-- ---------------------------------------------------------------------------
-- 1.4 receipt audit link + verification indexes
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists shift_id uuid references public.shifts (id) on delete set null;

create index if not exists payments_shift_idx on public.payments (tenant_id, shift_id);
create index if not exists payments_receipt_hash_lookup_idx on public.payments (receipt_hash);
create index if not exists payments_receipt_security_code_lookup_idx
  on public.payments (receipt_security_code);

-- A payment sealed inside a LOCKED shift is immutable. Enforced by trigger so
-- the guarantee holds for every write path, including SECURITY DEFINER RPCs.
create or replace function public.prevent_locked_shift_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_shift uuid;
  v_locked boolean;
begin
  -- On DELETE, NEW is NULL. Returning NEW from a BEFORE DELETE trigger silently
  -- cancels the delete, so the correct row must be chosen per operation.
  v_shift := case when tg_op = 'DELETE' then old.shift_id
                  else coalesce(new.shift_id, old.shift_id) end;

  if v_shift is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select s.status = 'LOCKED' into v_locked
  from public.shifts s
  where s.id = v_shift;

  if coalesce(v_locked, false) and current_user not in ('postgres', 'service_role') then
    raise exception 'This record is sealed inside a locked shift and cannot be modified'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists payments_locked_shift_guard on public.payments;
create trigger payments_locked_shift_guard
before update or delete on public.payments
for each row execute function public.prevent_locked_shift_mutation();

drop trigger if exists expenses_locked_shift_guard on public.expenses;
create trigger expenses_locked_shift_guard
before update or delete on public.expenses
for each row execute function public.prevent_locked_shift_mutation();

-- ===========================================================================
-- MODULE 2 — Atomic RPCs
-- ===========================================================================

-- 2.1a handover_shift ---------------------------------------------------------
-- Aggregates the drawer from the transactions actually linked to the shift, so
-- the figures can never be hand-typed by the person being reconciled.
create or replace function public.handover_shift(
  p_shift_id uuid,
  p_notes text default null
)
returns public.shifts
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_shift public.shifts;
  v_cash_in bigint;
  v_petty bigint;
begin
  if v_jwt_tenant is null or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to hand over shifts' using errcode = '42501';
  end if;

  select * into v_shift
  from public.shifts
  where id = p_shift_id and tenant_id = v_jwt_tenant;

  if v_shift.id is null then
    raise exception 'Shift not found' using errcode = '23503';
  end if;

  if v_shift.status <> 'OPEN' then
    raise exception 'Only an OPEN shift can be handed over' using errcode = '22023';
  end if;

  -- Cash only: UPI never touches the physical drawer.
  select coalesce(sum(
    case
      when p.cash_minor > 0 or p.upi_minor > 0 then p.cash_minor
      when p.method = 'cash' then p.amount_minor
      else 0
    end
  ), 0)
  into v_cash_in
  from public.payments p
  where p.tenant_id = v_jwt_tenant
    and p.shift_id = p_shift_id
    and p.status = 'paid';

  -- Rejected expenses never left the drawer, so they are excluded.
  select coalesce(sum(e.amount_minor), 0)
  into v_petty
  from public.expenses e
  where e.tenant_id = v_jwt_tenant
    and e.shift_id = p_shift_id
    and e.status <> 'REJECTED';

  update public.shifts
  set
    system_cash_in_minor = v_cash_in,
    petty_expenses_minor = v_petty,
    status = 'HANDED_OVER',
    notes = coalesce(nullif(btrim(p_notes), ''), notes)
  where id = p_shift_id and tenant_id = v_jwt_tenant
  returning * into v_shift;

  return v_shift;
end;
$$;

revoke all on function public.handover_shift(uuid, text) from public, anon;
grant execute on function public.handover_shift(uuid, text) to authenticated;

-- 2.1b verify_and_lock_shift --------------------------------------------------
create or replace function public.verify_and_lock_shift(
  p_shift_id uuid,
  p_actual_cash_minor bigint,
  p_notes text default null
)
returns public.shifts
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_shift public.shifts;
  v_expected bigint;
begin
  -- Verification is the owner's control over the person who held the drawer.
  if v_jwt_tenant is null or v_role <> 'owner' then
    raise exception 'Only an owner may verify and lock a shift' using errcode = '42501';
  end if;

  if p_actual_cash_minor is null or p_actual_cash_minor < 0 then
    raise exception 'Counted cash cannot be negative' using errcode = '22023';
  end if;

  select * into v_shift
  from public.shifts
  where id = p_shift_id and tenant_id = v_jwt_tenant;

  if v_shift.id is null then
    raise exception 'Shift not found' using errcode = '23503';
  end if;

  if v_shift.status = 'LOCKED' then
    raise exception 'Shift is already locked' using errcode = '22023';
  end if;

  if v_shift.status <> 'HANDED_OVER' then
    raise exception 'Shift must be handed over before it can be locked'
      using errcode = '22023';
  end if;

  v_expected := v_shift.opening_cash_minor
    + v_shift.system_cash_in_minor
    - v_shift.petty_expenses_minor;

  update public.shifts
  set
    actual_cash_minor = p_actual_cash_minor,
    variance_minor = p_actual_cash_minor - v_expected,
    closed_at = now(),
    status = 'LOCKED',
    notes = coalesce(nullif(btrim(p_notes), ''), notes)
  where id = p_shift_id and tenant_id = v_jwt_tenant
  returning * into v_shift;

  return v_shift;
end;
$$;

revoke all on function public.verify_and_lock_shift(uuid, bigint, text) from public, anon;
grant execute on function public.verify_and_lock_shift(uuid, bigint, text) to authenticated;

-- 2.2 review_expense ----------------------------------------------------------
create or replace function public.review_expense(
  p_expense_id uuid,
  p_action text,
  p_reason text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_expense public.expenses;
  v_action text := upper(btrim(coalesce(p_action, '')));
begin
  if v_jwt_tenant is null or v_role <> 'owner' then
    raise exception 'Only an owner may review petty expenses' using errcode = '42501';
  end if;

  if v_action not in ('APPROVE', 'REJECT') then
    raise exception 'Action must be APPROVE or REJECT' using errcode = '22023';
  end if;

  if v_action = 'REJECT' and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;

  select * into v_expense
  from public.expenses
  where id = p_expense_id and tenant_id = v_jwt_tenant;

  if v_expense.id is null then
    raise exception 'Expense not found' using errcode = '23503';
  end if;

  -- Rejecting restores the amount to the drawer, so the parent shift's petty
  -- total is recomputed rather than left stale.
  update public.expenses
  set
    status = case when v_action = 'APPROVE' then 'APPROVED' else 'REJECTED' end,
    approved_by_user_id = auth.uid(),
    approved_at = now(),
    rejection_reason = case when v_action = 'REJECT' then btrim(p_reason) else null end
  where id = p_expense_id and tenant_id = v_jwt_tenant
  returning * into v_expense;

  if v_expense.shift_id is not null then
    update public.shifts s
    set petty_expenses_minor = (
      select coalesce(sum(e.amount_minor), 0)
      from public.expenses e
      where e.shift_id = s.id and e.status <> 'REJECTED'
    )
    where s.id = v_expense.shift_id and s.status <> 'LOCKED';
  end if;

  return v_expense;
end;
$$;

revoke all on function public.review_expense(uuid, text, text) from public, anon;
grant execute on function public.review_expense(uuid, text, text) to authenticated;

-- 2.3 verify_receipt_authenticity ---------------------------------------------
--
-- The previous scheme used the first 12 hex chars of the payment UUID. Real
-- UUIDs are random enough for that, but any sequential/prefixed id space (such
-- as fixtures, or an imported ledger) collapses to a single prefix — and the
-- lookup would then resolve to the WRONG member's receipt. Anchoring on the
-- last 12 chars keeps the entropy where sequential ids actually vary, and the
-- match is exact rather than a LIKE prefix.
create or replace function public.verify_receipt_authenticity(p_query text)
returns table (
  payment_id uuid, receipt_number text, security_code text, member_name text,
  member_code text, amount_minor bigint, cash_minor bigint, upi_minor bigint,
  tender_mode text, currency text, issued_by text, created_at timestamptz,
  paid_at timestamptz, is_locked boolean, shift_status text
)
language plpgsql security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id','')::uuid;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_query text := upper(btrim(coalesce(p_query,'')));
  v_token text;
begin
  if v_jwt_tenant is null or v_role not in ('receptionist','owner') then
    raise exception 'Not authorized to verify receipts' using errcode='42501';
  end if;
  if char_length(v_query) < 4 then
    raise exception 'Provide a receipt number or security code' using errcode='22023';
  end if;

  v_token := replace(replace(v_query,'RCT-',''),'-','');

  return query
  select
    p.id,
    'RCT-' || upper(right(replace(p.id::text,'-',''), 12)),
    p.receipt_security_code,
    m.full_name, m.member_code, p.amount_minor, p.cash_minor, p.upi_minor,
    case when p.cash_minor > 0 and p.upi_minor > 0 then 'SPLIT'
         else upper(p.method::text) end,
    p.currency,
    coalesce(u.full_name,'Unknown staff'),
    p.created_at, p.paid_at,
    coalesce(s.status = 'LOCKED', false),
    coalesce(s.status,'UNASSIGNED')
  from public.payments p
  join public.members m on m.id = p.member_id
  left join public.users u on u.id = p.recorded_by
  left join public.shifts s on s.id = p.shift_id
  where p.tenant_id = v_jwt_tenant
    and (
      upper(p.receipt_security_code) = v_query
      or upper(right(replace(p.id::text,'-',''), 12)) = v_token
      or upper(replace(p.id::text,'-','')) = v_token
    )
  limit 5;
end;
$$;

revoke all on function public.verify_receipt_authenticity(text) from public, anon;
grant execute on function public.verify_receipt_authenticity(text) to authenticated;

commit;
