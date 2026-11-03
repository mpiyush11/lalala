-- Adds the trainer role ahead of the Owner Cockpit foundation migration.
--
-- Kept in its own file deliberately: PostgreSQL will not allow a newly added
-- enum value to be *used* in the same transaction that adds it, so the value
-- must be committed before 20260912 references it.
--
-- Existing values are lowercase ('receptionist', 'owner', 'superadmin') and RLS
-- policies compare against those literals, so 'trainer' follows the same
-- casing rather than the uppercase form used in the brief.
alter type public.user_role add value if not exists 'trainer';
