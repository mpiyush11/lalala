begin;

-- ===========================================================================
-- Public leads / enquiry funnel
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum (
      'new',
      'contacted',
      'trial_scheduled',
      'converted',
      'lost'
    );
  end if;
end
$$;

create table if not exists public.leads (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
  phone_number text not null check (char_length(btrim(phone_number)) between 7 and 20),
  source text not null,
  goal text,
  request text,
  status public.lead_status not null default 'new',
  converted_member_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_tenant_status_idx
  on public.leads (tenant_id, status, created_at desc);

alter table public.leads enable row level security;
alter table public.leads force row level security;

drop policy if exists leads_select_same_tenant on public.leads;
create policy leads_select_same_tenant on public.leads
  for select to authenticated
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

drop policy if exists leads_insert_same_tenant on public.leads;
create policy leads_insert_same_tenant on public.leads
  for insert to authenticated
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('receptionist', 'owner')
  );

drop policy if exists leads_update_same_tenant on public.leads;
create policy leads_update_same_tenant on public.leads
  for update to authenticated
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Consistent with every other business table: only an owner may delete.
drop policy if exists leads_delete_owner_only on public.leads;
create policy leads_delete_owner_only on public.leads
  for delete to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

-- ===========================================================================
-- Notification / audit feed
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_severity') then
    create type public.notification_severity as enum ('high', 'amber', 'info', 'neutral');
  end if;
end
$$;

create table if not exists public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null references public.tenants (tenant_id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  severity public.notification_severity not null default 'info',
  member_id uuid references public.members (id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_tenant_created_idx
  on public.notifications (tenant_id, is_read, created_at desc);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists notifications_select_same_tenant on public.notifications;
create policy notifications_select_same_tenant on public.notifications
  for select to authenticated
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

drop policy if exists notifications_insert_same_tenant on public.notifications;
create policy notifications_insert_same_tenant on public.notifications
  for insert to authenticated
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') in ('receptionist', 'owner')
  );

-- Marking a notification read is a normal desk action for either role.
drop policy if exists notifications_update_same_tenant on public.notifications;
create policy notifications_update_same_tenant on public.notifications
  for update to authenticated
  using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

drop policy if exists notifications_delete_owner_only on public.notifications;
create policy notifications_delete_owner_only on public.notifications
  for delete to authenticated
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
  );

commit;
