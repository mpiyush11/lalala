begin;

-- Receipt/branding metadata for the Owner Settings screen.
-- Additive and idempotent; no existing tenant column is altered.
alter table public.tenants
  add column if not exists address text,
  add column if not exists support_phone text,
  add column if not exists upi_id text;

-- Owners may maintain their own tenant record; receptionists remain read-only
-- (the existing attendance-toggle policy already covers their narrow write).
drop policy if exists tenants_update_owner_only on public.tenants;
create policy tenants_update_owner_only on public.tenants
  for update to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  )
  with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

commit;
