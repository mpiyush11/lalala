-- Run after migrations and seed data:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_verification.sql
-- The transaction is rolled back, so verification does not alter seeded data.

begin;

set local role authenticated;
set local request.jwt.claims = '{
  "sub":"20000000-0000-4000-8000-000000000002",
  "role":"authenticated",
  "app_metadata":{
    "tenant_id":"10000000-0000-4000-8000-000000000001",
    "role":"receptionist"
  }
}';

-- Receptionist sees its own tenant and cannot see the second tenant.
do $$
begin
  if (select count(*) from public.tenants) <> 1 then
    raise exception 'RLS FAILED: receptionist tenant visibility is not exactly one row';
  end if;

  if exists (
    select 1
    from public.tenants
    where id = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'RLS FAILED: receptionist can see another tenant';
  end if;

  if (select count(*) from public.members) <> 2 then
    raise exception 'RLS FAILED: receptionist member visibility crossed tenant boundary';
  end if;
end;
$$;

-- A cross-tenant INSERT must fail its RLS WITH CHECK policy.
do $$
begin
  begin
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
      '10000000-0000-4000-8000-000000000002',
      'RLS-CROSS-TENANT',
      'Blocked Cross Tenant Member',
      '+919899999991',
      '2026-08-07',
      '2027-08-06',
      'active',
      '20000000-0000-4000-8000-000000000002'
    );

    raise exception 'RLS FAILED: cross-tenant member insert succeeded';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

-- DELETE policies silently expose zero matching rows to a receptionist. Verify
-- both the affected-row count and continued row existence.
do $$
declare
  affected integer;
begin
  delete from public.members
  where id = '30000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'ANTI-FRAUD FAILED: receptionist deleted a member';
  end if;

  delete from public.payments
  where id = '40000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'ANTI-FRAUD FAILED: receptionist deleted a payment';
  end if;

  delete from public.attendance
  where id = '50000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'ANTI-FRAUD FAILED: receptionist deleted attendance';
  end if;

  if not exists (
    select 1 from public.members
    where id = '30000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'ANTI-FRAUD FAILED: protected member no longer exists';
  end if;
end;
$$;

-- Owner can create and delete a tenant-scoped member with no dependent history.
set local request.jwt.claims = '{
  "sub":"20000000-0000-4000-8000-000000000001",
  "role":"authenticated",
  "app_metadata":{
    "tenant_id":"10000000-0000-4000-8000-000000000001",
    "role":"owner"
  }
}';

insert into public.members (
  id,
  tenant_id,
  member_code,
  full_name,
  phone_number,
  membership_started_on,
  membership_expires_on,
  status,
  created_by
) values (
  '30000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  'RLS-OWNER-DELETE',
  'Owner Delete Verification',
  '+919899999999',
  '2026-08-07',
  '2027-08-06',
  'active',
  '20000000-0000-4000-8000-000000000001'
);

do $$
declare
  affected integer;
begin
  delete from public.members
  where id = '30000000-0000-4000-8000-000000000099';
  get diagnostics affected = row_count;

  if affected <> 1 then
    raise exception 'OWNER DELETE FAILED: expected one deleted member, got %', affected;
  end if;
end;
$$;

rollback;
