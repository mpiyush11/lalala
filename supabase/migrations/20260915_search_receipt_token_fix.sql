-- ===========================================================================
-- GymOS — quick-search receipt token hardening
-- ===========================================================================
-- Two defects found while testing `search_members_and_receipts` against the
-- live database. Both are pre-existing and also affect
-- `verify_receipt_authenticity`; this migration fixes the search path and
-- leaves a decision for the receipt-number format itself (see NOTE below).
--
-- DEFECT 1 — receipt token collisions.
--   `right(replace(id::text,'-',''), 12)` produces only 25 distinct tokens for
--   the 29 payments currently in the database. Fixture UUIDs such as
--   40000000-...-000000000001 and 91000000-...-000000000001 differ only in
--   their FIRST bytes, so both the first-12 and last-12 strategies collapse.
--   `receipt_hash` and `receipt_security_code` are 29/29 unique.
--
-- DEFECT 2 — format disagreement.
--   `src/app/dashboard/payments/receipt/[id]/page.tsx` prints
--   `RCT-<FIRST 12>` while the lookup RPCs match `RCT-<LAST 12>`. A receipt
--   printed today therefore cannot be found by typing the number on it.
--
-- Fix applied here: search accepts the security code (unique), the receipt
-- hash prefix (unique), AND either UUID slice, and returns an unambiguous
-- hash-derived token alongside the security code. Matching is exact, never
-- LIKE, so a collision can surface two rows rather than silently resolving to
-- the wrong member.
--
-- NOTE FOR THE TECHNICAL LEAD: the printed `RCT-` format is unchanged because
-- altering it would invalidate every receipt already issued. Recommend a
-- follow-up decision to move the printed number onto `receipt_hash` (or onto
-- `receipt_security_code`, which is already unique and already printed).
-- ===========================================================================

begin;

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
  -- Normalise "RCT-ABC123", "SEC-A823-B3BC", or a bare code to bare uppercase.
  v_token  := upper(regexp_replace(v_raw, '[^A-Za-z0-9]', '', 'g'));
  v_token  := regexp_replace(v_token, '^(RCT|SEC)', '');

  return query
  select
    'receipt'::text,
    m.id, m.member_code, m.full_name, m.phone_number,
    m.balance_due_minor, m.membership_expires_on, m.status::text,
    null::uuid, null::date,
    p.id,
    -- Hash-derived and genuinely unique, unlike the UUID slice.
    'RCT-' || upper(left(p.receipt_hash, 12)),
    p.receipt_security_code,
    p.amount_minor
  from public.payments p
  join public.members m on m.id = p.member_id
  where p.tenant_id = p_tenant_id
    and char_length(v_token) >= 4
    and (
      -- Unique identifiers first.
      -- Strip the SEC/RCT prefix from BOTH sides: the query token has already
      -- had it removed, so the stored value must be normalised identically.
      regexp_replace(
        upper(regexp_replace(coalesce(p.receipt_security_code, ''), '[^A-Za-z0-9]', '', 'g')),
        '^(RCT|SEC)', ''
      ) = v_token
      or upper(left(coalesce(p.receipt_hash, ''), 12)) = v_token
      -- Legacy tolerance: both UUID slices, so numbers on already-printed
      -- receipts still resolve. Exact match, so a collision returns two rows
      -- and is visible rather than silently wrong.
      or upper(right(replace(p.id::text, '-', ''), 12)) = v_token
      or upper(left(replace(p.id::text, '-', ''), 12)) = v_token
    )
  order by p.paid_at desc
  limit v_limit;

  return query
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

commit;
