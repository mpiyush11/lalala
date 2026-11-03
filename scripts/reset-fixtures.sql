-- ===========================================================================
-- GymOS — atomic fixture reset
-- ===========================================================================
-- Why this exists: "restore the fixtures" was previously a human writing UPDATE
-- statements from memory of what the values used to be. That process has
-- already caused one incident — a cleanup deleted eight payment rows, two of
-- which were legitimate base-seed records, and it was only caught by diffing
-- counts afterwards.
--
-- Contract:
--   * ONE transaction. Either the database ends in the exact fixture state or
--     nothing changes at all.
--   * Post-conditions are ASSERTED before COMMIT. A count that does not match
--     raises and rolls the whole thing back, so a silently half-restored
--     database is not a reachable state.
--   * Touches only Iron Paradise (tenant 1) fixture rows. Organically created
--     records and the second tenant are never in scope.
--
-- Usage:
--   psql "$POOLER_URL" -v ON_ERROR_STOP=1 -f scripts/reset-fixtures.sql
--   npm run db:reset:fixtures
--
-- Reserved UUID prefixes (fixtures only):
--   90000000- members      95000000- attendance
--   91000000- payments     96000000- notifications
--   92000000- freezes      97000000- shifts
--   93000000- expenses     98000000- trainer payouts
--   94000000- leads
-- Base seed rows live under 30000000- (members) and 40000000- (payments) and
-- are restored, not deleted.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- 0. Advisory lock so two concurrent resets cannot interleave.
-- ---------------------------------------------------------------------------
select pg_advisory_xact_lock(hashtext('gymos_reset_fixtures'));

-- ---------------------------------------------------------------------------
-- 1. Remove anything created by test runs that is NOT a known fixture.
-- ---------------------------------------------------------------------------
-- Playwright mutation tests insert real rows (payouts, payments). Without this
-- sweep they accumulate across runs and every subsequent assertion drifts.
do $$
declare
  t_id uuid := '10000000-0000-4000-8000-000000000001';
  removed integer;
begin
  delete from public.trainer_payouts
  where tenant_id = t_id
    and id::text not like '98000000%';
  get diagnostics removed = row_count;
  raise notice 'Removed % stray trainer payout(s)', removed;

  delete from public.payments
  where tenant_id = t_id
    and id::text not like '91000000%'
    and id::text not like '40000000%';
  get diagnostics removed = row_count;
  raise notice 'Removed % stray payment(s)', removed;

  -- Children first: attendance, freezes and payments all carry a member FK, so
  -- deleting the member outright aborts on the constraint.
  delete from public.attendance
  where tenant_id = t_id
    and member_id in (
      select id from public.members
      where tenant_id = t_id
        and id::text not like '90000000%'
        and id::text not like '30000000%'
    );
  get diagnostics removed = row_count;
  raise notice 'Removed % attendance row(s) for stray members', removed;

  delete from public.member_freezes
  where tenant_id = t_id
    and member_id in (
      select id from public.members
      where tenant_id = t_id
        and id::text not like '90000000%'
        and id::text not like '30000000%'
    );

  delete from public.notifications
  where tenant_id = t_id
    and member_id in (
      select id from public.members
      where tenant_id = t_id
        and id::text not like '90000000%'
        and id::text not like '30000000%'
    );

  delete from public.payments
  where tenant_id = t_id
    and member_id in (
      select id from public.members
      where tenant_id = t_id
        and id::text not like '90000000%'
        and id::text not like '30000000%'
    );

  delete from public.members
  where tenant_id = t_id
    and id::text not like '90000000%'
    and id::text not like '30000000%';
  get diagnostics removed = row_count;
  raise notice 'Removed % stray member(s)', removed;

  -- Detach shift references before removing a stray shift.
  update public.payments set shift_id = null
  where tenant_id = t_id
    and shift_id in (
      select id from public.shifts
      where tenant_id = t_id and id::text not like '97000000%'
    );

  update public.expenses set shift_id = null
  where tenant_id = t_id
    and shift_id in (
      select id from public.shifts
      where tenant_id = t_id and id::text not like '97000000%'
    );

  delete from public.shifts
  where tenant_id = t_id
    and id::text not like '97000000%';
  get diagnostics removed = row_count;
  raise notice 'Removed % stray shift(s)', removed;

  -- Plans created by hand during a test run would change what reception can
  -- sell, so the catalogue is reset to the four canonical rows too.
  delete from public.membership_plans
  where tenant_id = t_id
    and id::text not like '99000000%';
  get diagnostics removed = row_count;
  raise notice 'Removed % stray plan(s)', removed;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Restore the base seed rows the comprehensive fixture depends on.
-- ---------------------------------------------------------------------------
-- These live in supabase/seed.sql. They are re-asserted here so a reset is
-- self-contained and does not require running two files in the right order.
insert into public.payments (
  id, tenant_id, member_id, amount_minor, currency, status, method,
  reference_number, paid_at, period_starts_on, period_ends_on,
  discount_minor, notes, recorded_by
) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', 1800000, 'INR', 'paid', 'upi',
   'UPI-IPG-1001', '2026-08-01 04:30:00+00', '2026-08-01', '2027-07-31',
   100000, 'Annual plan paid in full', '20000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000002', 900000, 'INR', 'paid', 'cash',
   'CASH-IPG-1002', '2026-07-15 05:00:00+00', '2026-07-15', '2027-01-14',
   0, 'Six-month plan', '20000000-0000-4000-8000-000000000002')
on conflict (id) do update set
  amount_minor  = excluded.amount_minor,
  status        = excluded.status,
  method        = excluded.method,
  paid_at       = excluded.paid_at,
  discount_minor = excluded.discount_minor,
  notes         = excluded.notes;

-- ---------------------------------------------------------------------------
-- 2b. Canonical membership plans.
-- ---------------------------------------------------------------------------
-- Reception reads these live, and the Playwright plan-propagation spec edits a
-- price, so they must return to a known state on every reset.
insert into public.membership_plans (id, tenant_id, name, duration_months, price_minor, is_active)
values
  ('99000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '1 Month',   1,  150000, true),
  ('99000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '3 Months',  3,  400000, true),
  ('99000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '6 Months',  6,  750000, true),
  ('99000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '1 Year',   12, 1200000, true)
on conflict (id) do update set
  name = excluded.name,
  duration_months = excluded.duration_months,
  price_minor = excluded.price_minor,
  is_active = excluded.is_active;

-- ---------------------------------------------------------------------------
-- 3. Re-apply the comprehensive fixture.
-- ---------------------------------------------------------------------------
-- \ir keeps this ONE transaction: the included file's own begin/commit are
-- stripped by the wrapper in `npm run db:reset:fixtures`. When running this
-- file directly, the nested begin/commit are harmless no-ops inside psql's
-- single-transaction handling, but the wrapper is the supported path.
\ir seed-comprehensive-test-data.sql

-- ---------------------------------------------------------------------------
-- 4. Post-conditions. Any mismatch aborts the transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  t_id uuid := '10000000-0000-4000-8000-000000000001';
  v_actual  integer;
  v_amount  bigint;
  v_status  text;
  failures  text[] := array[]::text[];

  procedure_note text;
begin
  -- Members: 25 fixture (90000000-) + 2 base seed (30000000-).
  --
  -- NOTE: this baseline was corrected after the first live run. The previous
  -- figure of 29 silently included two members created organically through the
  -- UI during earlier test sessions. Sweeping them is the point of step 1 — a
  -- fixture reset that leaves test detritus behind is not deterministic.
  select count(*) into v_actual from public.members where tenant_id = t_id;
  if v_actual <> 27 then
    failures := failures || format('members: expected 27, got %s', v_actual);
  end if;

  -- Payments: 25 fixture + 2 base seed.
  select count(*) into v_actual from public.payments where tenant_id = t_id;
  if v_actual <> 27 then
    failures := failures || format('payments: expected 27, got %s', v_actual);
  end if;

  select count(*) into v_actual from public.expenses
  where tenant_id = t_id and status = 'PENDING_APPROVAL';
  if v_actual <> 2 then
    failures := failures || format('pending expenses: expected 2, got %s', v_actual);
  end if;

  select coalesce(sum(amount_minor), 0) into v_amount from public.expenses
  where tenant_id = t_id and status = 'PENDING_APPROVAL';
  if v_amount <> 60000 then
    failures := failures || format('pending expense total: expected 60000, got %s', v_amount);
  end if;

  select count(*) into v_actual from public.expenses
  where tenant_id = t_id and status = 'APPROVED';
  if v_actual <> 3 then
    failures := failures || format('approved expenses: expected 3, got %s', v_actual);
  end if;

  -- Dues: 5 members owing ₹27,500 total.
  select count(*), coalesce(sum(balance_due_minor), 0)
    into v_actual, v_amount
  from public.members where tenant_id = t_id and balance_due_minor > 0;
  if v_actual <> 5 then
    failures := failures || format('members owing: expected 5, got %s', v_actual);
  end if;
  if v_amount <> 2750000 then
    failures := failures || format('dues total: expected 2750000, got %s', v_amount);
  end if;

  -- Shifts: exactly one of each state, in the right slot.
  select count(*) into v_actual from public.shifts where tenant_id = t_id;
  if v_actual <> 3 then
    failures := failures || format('shifts: expected 3, got %s', v_actual);
  end if;

  select status into v_status from public.shifts
  where id = '97000000-0000-4000-8000-000000000002';
  if v_status is distinct from 'OPEN' then
    failures := failures || format('shift 2: expected OPEN, got %s', coalesce(v_status, 'NULL'));
  end if;

  select status into v_status from public.shifts
  where id = '97000000-0000-4000-8000-000000000003';
  if v_status is distinct from 'HANDED_OVER' then
    failures := failures || format('shift 3: expected HANDED_OVER, got %s', coalesce(v_status, 'NULL'));
  end if;

  -- The handed-over shift must expect exactly ₹2,800; the drawer-close test
  -- asserts against this figure.
  select opening_cash_minor + system_cash_in_minor - petty_expenses_minor
    into v_amount
  from public.shifts where id = '97000000-0000-4000-8000-000000000003';
  if v_amount <> 280000 then
    failures := failures || format('shift 3 expected cash: expected 280000, got %s', v_amount);
  end if;

  -- Exactly one trainer payout, so commission payable computes to zero.
  select count(*), coalesce(sum(amount_minor), 0) into v_actual, v_amount
  from public.trainer_payouts where tenant_id = t_id;
  if v_actual <> 1 or v_amount <> 440000 then
    failures := failures || format('trainer payouts: expected 1 x 440000, got %s x %s', v_actual, v_amount);
  end if;

  -- Membership plans: four active rows at the canonical rates.
  select count(*) into v_actual from public.membership_plans
  where tenant_id = t_id and is_active;
  if v_actual <> 4 then
    failures := failures || format('active plans: expected 4, got %s', v_actual);
  end if;

  select coalesce(sum(price_minor), 0) into v_amount from public.membership_plans
  where tenant_id = t_id and is_active;
  if v_amount <> 2500000 then
    failures := failures || format('plan price total: expected 2500000, got %s', v_amount);
  end if;

  -- Staff provisioning tests create real auth users; only the four seeded
  -- accounts should survive a reset.
  select count(*) into v_actual from public.users where tenant_id = t_id;
  if v_actual <> 4 then
    failures := failures || format('staff: expected 4, got %s', v_actual);
  end if;

  -- Tenant branding drives the WhatsApp UPI assertion.
  select upi_id into v_status from public.tenants where tenant_id = t_id;
  if v_status is distinct from 'ironparadise@upi' then
    failures := failures || format('upi_id: expected ironparadise@upi, got %s', coalesce(v_status, 'NULL'));
  end if;

  if array_length(failures, 1) > 0 then
    raise exception E'Fixture reset FAILED post-conditions:\n  - %',
      array_to_string(failures, E'\n  - ');
  end if;

  raise notice '---------------------------------------------';
  raise notice 'Fixture reset OK — all post-conditions passed';
  raise notice '  members 27 | payments 27 | shifts 3';
  raise notice '  expenses 3 approved / 2 pending (Rs 600)';
  raise notice '  dues 5 members / Rs 27,500';
  raise notice '  plans 4 active / staff 4';
  raise notice '---------------------------------------------';
end $$;

commit;
