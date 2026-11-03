-- ===========================================================================
-- GymOS — stabilization sprint: prune dead RPCs, add server-side aggregates
-- ===========================================================================
-- Three concerns, one migration because they are all attack-surface / scaling
-- hygiene on the same authenticated role:
--
--   1. Drop mutation endpoints no application code calls any more. Every
--      `grant execute ... to authenticated` is a door; an unused door is pure
--      downside.
--   2. Add `get_owner_dashboard_aggregates` so the cockpit stops streaming the
--      whole payments table into Node to add up four numbers.
--   3. Add `search_members_and_receipts` so the new quick-search bar filters in
--      Postgres (indexed) rather than shipping the roster to the browser.
--
-- AUDIT NOTE — `quick_renew_member` was on the proposed drop list and has been
-- deliberately RETAINED. It is called live from `desk-search.tsx` and
-- `notification-bell.tsx` via `QuickRenewModal`. Dropping it would have taken
-- the front desk's one-tap renewal offline. The original audit that listed it
-- as dead was wrong.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Prune superseded mutation endpoints
-- ---------------------------------------------------------------------------
-- All five were replaced by the split-tender generation:
--   create_member_with_code      -> register_member_split_payment
--   register_member_with_payment -> register_member_split_payment
--   collect_member_payment       -> collect_split_payment
--   settle_member_due            -> collect_split_payment (p_pending_payment_id)
--   renew_member_plan            -> collect_split_payment (p_duration_days)
--
-- `drop function if exists` with the full identity argument list so a partial
-- prior run, or an overload that never existed, cannot abort the migration.
-- Signatures below were read back from `pg_proc.oid::regprocedure` against the
-- live database rather than inferred from the original migrations, because an
-- argument-list guess that does not match simply no-ops and silently leaves the
-- endpoint reachable.

drop function if exists public.create_member_with_code(
  uuid, text, text, text, date, date
);

drop function if exists public.register_member_with_payment(
  uuid, text, text, date, date, bigint, public.payment_method
);

drop function if exists public.collect_member_payment(
  uuid, uuid, bigint, public.payment_method, text, uuid
);

drop function if exists public.settle_member_due(
  uuid, uuid, uuid, bigint, public.payment_method, text
);

drop function if exists public.renew_member_plan(
  uuid, uuid, bigint, public.payment_method, integer, text, text
);

-- Belt and braces: if any of the above still exist under a different argument
-- signature, revoke the authenticated grant so they are at least unreachable.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_member_with_code',
        'register_member_with_payment',
        'collect_member_payment',
        'settle_member_due',
        'renew_member_plan'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    raise notice 'Revoked lingering overload: %', r.sig;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Owner dashboard aggregates
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the aggregate can read shift and payment rows without
-- handing the client a row-level feed of them. Tenant and role are re-asserted
-- from the verified JWT; `p_tenant_id` is never trusted on its own.
--
-- Everything is computed in one round trip and returns a single row, so the
-- cockpit's memory footprint is constant regardless of roster size.

create or replace function public.get_owner_dashboard_aggregates(p_tenant_id uuid)
returns table (
  collections_today_minor    bigint,
  cash_today_minor           bigint,
  upi_today_minor            bigint,
  drawer_cash_minor          bigint,
  drawer_difference_minor    bigint,
  difference_staff_name      text,
  open_shift_staff_name      text,
  open_shift_started_at      timestamptz,
  pending_expense_count      integer,
  pending_expense_minor      bigint,
  dues_total_minor           bigint,
  dues_member_count          integer,
  overdue_member_count       integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_role       text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_timezone   text;
  v_today      date;
begin
  if v_jwt_tenant is null
     or v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('owner', 'superadmin') then
    raise exception 'Not authorized to read dashboard aggregates for this tenant'
      using errcode = '42501';
  end if;

  select timezone into v_timezone from public.tenants where tenant_id = p_tenant_id;
  if v_timezone is null then
    raise exception 'Tenant not found' using errcode = '23503';
  end if;

  -- "Today" is the gym's local day, not UTC: a 1am UTC payment on the 12th is
  -- still the 11th in Jaipur and must land in the same drawer.
  v_today := (now() at time zone v_timezone)::date;

  return query
  with today_payments as (
    select
      -- Split tender is the source of truth; `method` only carries the
      -- dominant tender for legacy single-mode rows.
      case
        when p.cash_minor > 0 or p.upi_minor > 0 then p.cash_minor
        when p.method = 'cash' then p.amount_minor
        else 0
      end as cash_minor,
      case
        when p.cash_minor > 0 or p.upi_minor > 0 then p.upi_minor
        when p.method = 'upi' then p.amount_minor
        else 0
      end as upi_minor
    from public.payments p
    where p.tenant_id = p_tenant_id
      and p.status = 'paid'
      and (p.paid_at at time zone v_timezone)::date = v_today
  ),
  money_today as (
    select
      coalesce(sum(cash_minor), 0)::bigint as cash_minor,
      coalesce(sum(upi_minor), 0)::bigint  as upi_minor
    from today_payments
  ),
  live_shifts as (
    select s.*
    from public.shifts s
    where s.tenant_id = p_tenant_id
      and s.status <> 'LOCKED'
  ),
  drawer as (
    select
      coalesce(
        sum(opening_cash_minor + system_cash_in_minor - petty_expenses_minor),
        0
      )::bigint as cash_minor
    from live_shifts
  ),
  -- Any declared mismatch on a shift still in play. Ordered so the report is
  -- deterministic when more than one shift is out of balance.
  mismatch as (
    select ls.variance_minor, u.full_name
    from live_shifts ls
    left join public.users u on u.id = ls.staff_id
    where coalesce(ls.variance_minor, 0) <> 0
    order by ls.opened_at desc
    limit 1
  ),
  open_shift as (
    select ls.opened_at, u.full_name
    from live_shifts ls
    left join public.users u on u.id = ls.staff_id
    where ls.status = 'OPEN'
    order by ls.opened_at desc
    limit 1
  ),
  pending_expenses as (
    select
      count(*)::integer                      as voucher_count,
      coalesce(sum(e.amount_minor), 0)::bigint as voucher_minor
    from public.expenses e
    where e.tenant_id = p_tenant_id
      and e.status = 'PENDING_APPROVAL'
  ),
  -- A member is "overdue" once the promised settlement date has passed.
  dues as (
    select
      coalesce(sum(m.balance_due_minor), 0)::bigint as total_minor,
      count(*)::integer                             as member_count,
      count(*) filter (
        where exists (
          select 1
          from public.payments p
          where p.tenant_id = m.tenant_id
            and p.member_id = m.id
            and p.balance_due_minor > 0
            and p.due_settlement_date is not null
            and p.due_settlement_date < v_today
        )
      )::integer as overdue_count
    from public.members m
    where m.tenant_id = p_tenant_id
      and m.balance_due_minor > 0
  )
  select
    (money_today.cash_minor + money_today.upi_minor)::bigint,
    money_today.cash_minor,
    money_today.upi_minor,
    drawer.cash_minor,
    coalesce((select variance_minor from mismatch), 0)::bigint,
    (select full_name from mismatch),
    (select full_name from open_shift),
    (select opened_at from open_shift),
    pending_expenses.voucher_count,
    pending_expenses.voucher_minor,
    dues.total_minor,
    dues.member_count,
    dues.overdue_count
  from money_today, drawer, pending_expenses, dues;
end $$;

revoke all on function public.get_owner_dashboard_aggregates(uuid) from public, anon;
grant execute on function public.get_owner_dashboard_aggregates(uuid) to authenticated;

comment on function public.get_owner_dashboard_aggregates(uuid) is
  'Single-row owner cockpit summary. Replaces client-side reduction over the '
  'payments/members/shifts tables so cockpit memory stays constant as the '
  'roster grows. Re-asserts tenant + owner role from the JWT.';

-- ---------------------------------------------------------------------------
-- 3. Quick search: members and receipts
-- ---------------------------------------------------------------------------
-- Searching in Postgres rather than the browser means the roster is never
-- shipped to the client, and the result set is capped server-side.

create index if not exists members_tenant_name_trgm_idx
  on public.members (tenant_id, lower(full_name));

create index if not exists members_tenant_phone_idx
  on public.members (tenant_id, phone_number);

create or replace function public.search_members_and_receipts(
  p_tenant_id uuid,
  p_query text,
  p_limit integer default 8
)
returns table (
  kind                text,
  member_id           uuid,
  member_code         text,
  full_name           text,
  phone_number        text,
  balance_due_minor   bigint,
  membership_expires_on date,
  status              text,
  pending_payment_id  uuid,
  due_settlement_date date,
  payment_id          uuid,
  receipt_number      text,
  security_code       text,
  amount_minor        bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_jwt_tenant uuid := nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
  v_role       text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_raw        text := btrim(coalesce(p_query, ''));
  v_term       text;
  v_digits     text;
  v_token      text;
  v_limit      integer := least(greatest(coalesce(p_limit, 8), 1), 25);
begin
  if v_jwt_tenant is null
     or v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('owner', 'superadmin') then
    raise exception 'Not authorized to search this tenant' using errcode = '42501';
  end if;

  -- Two characters is enough for a phone fragment but short enough to stay
  -- cheap; anything shorter would scan the whole roster for no user benefit.
  if char_length(v_raw) < 2 then
    return;
  end if;

  v_term   := '%' || lower(v_raw) || '%';
  v_digits := regexp_replace(v_raw, '\D', '', 'g');
  -- Accept "RCT-ABC123", "SEC-A823-B3BC", or a bare code.
  v_token  := upper(replace(replace(v_raw, 'RCT-', ''), '-', ''));

  return query
  -- Receipt / security code lookup. Anchored on the LAST 12 hex chars of the
  -- payment UUID: sequential id spaces share a prefix, so a first-12 match
  -- resolves to the wrong member's receipt.
  select
    'receipt'::text,
    m.id, m.member_code, m.full_name, m.phone_number,
    m.balance_due_minor, m.membership_expires_on, m.status::text,
    null::uuid, null::date,
    p.id,
    'RCT-' || upper(right(replace(p.id::text, '-', ''), 12)),
    p.receipt_security_code,
    p.amount_minor
  from public.payments p
  join public.members m on m.id = p.member_id
  where p.tenant_id = p_tenant_id
    and char_length(v_token) >= 4
    and (
      upper(right(replace(p.id::text, '-', ''), 12)) = v_token
      or upper(replace(coalesce(p.receipt_security_code, ''), '-', '')) = v_token
      or upper(coalesce(p.receipt_security_code, '')) = upper(v_raw)
    )
  limit v_limit;

  return query
  -- Member lookup by name or phone, with the oldest open balance attached so
  -- the caller can settle it in one RPC without a second round trip.
  select
    'member'::text,
    m.id, m.member_code, m.full_name, m.phone_number,
    m.balance_due_minor, m.membership_expires_on, m.status::text,
    due.payment_id, due.due_settlement_date,
    null::uuid, null::text, null::text, null::bigint
  from public.members m
  left join lateral (
    select p.id as payment_id, p.due_settlement_date
    from public.payments p
    where p.tenant_id = m.tenant_id
      and p.member_id = m.id
      and p.balance_due_minor > 0
    order by p.due_settlement_date nulls last, p.paid_at
    limit 1
  ) due on true
  where m.tenant_id = p_tenant_id
    and (
      lower(m.full_name) like v_term
      or lower(m.member_code) like v_term
      or (char_length(v_digits) >= 3 and regexp_replace(m.phone_number, '\D', '', 'g') like '%' || v_digits || '%')
    )
  order by
    -- Members who owe money float to the top: that is why an owner searches.
    (m.balance_due_minor > 0) desc,
    m.full_name
  limit v_limit;
end $$;

revoke all on function public.search_members_and_receipts(uuid, text, integer) from public, anon;
grant execute on function public.search_members_and_receipts(uuid, text, integer) to authenticated;

comment on function public.search_members_and_receipts(uuid, text, integer) is
  'Owner quick-search over member name/code/phone and receipt/security codes. '
  'Filters and caps server-side so the roster never reaches the browser.';

commit;
