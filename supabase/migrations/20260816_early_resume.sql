begin;

-- ---------------------------------------------------------------------------
-- Early resume: roll back unused frozen days.
-- ---------------------------------------------------------------------------
-- Freezing extends expiry by the full planned duration up-front. If a member
-- returns early, the days they did NOT actually use must be clawed back or the
-- gym gifts free membership.
--
--   actual_frozen    = today - freeze_started_on
--   unused_days      = planned_frozen_days - actual_frozen
--   new_expiry       = current_expiry - unused_days
--
-- SECURITY DEFINER because status/expiry writes bypass the owner-only expiry
-- trigger; tenant and role are therefore re-asserted from the verified JWT.
create or replace function public.resume_member_early(
  p_tenant_id uuid,
  p_member_id uuid
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
  v_timezone text;
  v_today date;
  v_planned integer;
  v_actual integer;
  v_unused integer;
  v_new_expiry date;
begin
  if v_jwt_tenant is null
     or v_jwt_tenant is distinct from p_tenant_id
     or v_role not in ('receptionist', 'owner') then
    raise exception 'Not authorized to resume members for this tenant'
      using errcode = '42501';
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

  if v_member.status <> 'paused' then
    raise exception 'Only a paused membership can be resumed' using errcode = '22023';
  end if;

  if v_member.freeze_started_on is null or v_member.freeze_resumes_on is null then
    raise exception 'Freeze window is incomplete for this member' using errcode = '22023';
  end if;

  v_planned := v_member.freeze_resumes_on - v_member.freeze_started_on;
  -- Clamp to the planned window: resuming before the start (clock skew) counts
  -- as zero days used, and past the end reclaims nothing.
  v_actual := greatest(0, least(v_today - v_member.freeze_started_on, v_planned));
  v_unused := greatest(0, v_planned - v_actual);

  v_new_expiry := v_member.membership_expires_on - v_unused;

  update public.members
  set
    membership_expires_on = v_new_expiry,
    status = case
      when v_new_expiry >= v_today then 'active'::public.member_status
      else 'expired'::public.member_status
    end,
    freeze_started_on = null,
    freeze_resumes_on = null,
    freeze_reason = null
  where id = p_member_id and tenant_id = p_tenant_id
  returning * into v_member;

  -- Audit the rollback so an owner can reconcile the adjustment later.
  insert into public.member_freezes (
    tenant_id, member_id, freeze_started_on, freeze_resumes_on, frozen_days,
    reason, previous_expiry, new_expiry, recorded_by
  ) values (
    p_tenant_id, p_member_id,
    v_new_expiry - 0, v_today, greatest(v_actual, 1),
    format('Early resume: used %s of %s days, %s rolled back', v_actual, v_planned, v_unused),
    v_new_expiry + v_unused, v_new_expiry, auth.uid()
  );

  return v_member;
end;
$$;

revoke all on function public.resume_member_early(uuid, uuid) from public, anon;
grant execute on function public.resume_member_early(uuid, uuid) to authenticated;

commit;
