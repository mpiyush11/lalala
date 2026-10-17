-- ===========================================================================
-- GymOS — comprehensive manual/E2E test fixture
-- ===========================================================================
-- Scope: tenant "Iron Paradise Gym" (slug: ironparadise) only.
--
-- Idempotent by construction: every row uses a deterministic UUID in a
-- reserved 9xxxxxxx- prefix and is written with ON CONFLICT DO UPDATE. Re-running
-- converges to the same state and never touches organically created records or
-- the second tenant.
--
-- Reference "today" is 11 Sep 2026 (Asia/Kolkata), matching the relative dates
-- in the specification (expiring today, due tomorrow, expired 3 days ago, ...).
-- ===========================================================================

begin;

do $$
declare
  t_id        uuid := '10000000-0000-4000-8000-000000000001';
  staff_id    uuid := '20000000-0000-4000-8000-000000000002';  -- Meera Joshi (receptionist)
  today       date := date '2026-09-11';
begin

-- ---------------------------------------------------------------------------
-- Purge only previously seeded fixture rows (9xxxxxxx- prefix), children first.
-- ---------------------------------------------------------------------------
delete from public.attendance     where tenant_id = t_id and id::text like '9%';
delete from public.payments       where tenant_id = t_id and id::text like '9%';
delete from public.member_freezes where tenant_id = t_id and id::text like '9%';
delete from public.notifications  where tenant_id = t_id and id::text like '9%';
delete from public.leads          where tenant_id = t_id and id::text like '9%';
delete from public.expenses       where tenant_id = t_id and id::text like '9%';

-- =========================================================================
-- SEGMENT 1 — 5 active members, fully paid, distant expiry
-- =========================================================================
insert into public.members (
  id, tenant_id, member_code, full_name, phone_number, email,
  membership_started_on, membership_expires_on, status, balance_due_minor,
  notes, created_by
) values
  ('90000000-0000-4000-8000-000000000001', t_id, 'IPG-2001', 'Kabir Malhotra',      '+919820100001', 'kabir.malhotra@example.in',  date '2026-08-01', date '2027-07-31', 'active', 0, '12-Month Annual Elite',        staff_id),
  ('90000000-0000-4000-8000-000000000002', t_id, 'IPG-2002', 'Ananya Iyer',         '+919820100002', 'ananya.iyer@example.in',     date '2026-08-15', date '2027-02-14', 'active', 0, '6-Month Strength Pro',         staff_id),
  ('90000000-0000-4000-8000-000000000003', t_id, 'IPG-2003', 'Vikramaditya Rathore','+919820100003', 'vikram.rathore@example.in',  date '2026-09-01', date '2026-11-30', 'active', 0, '3-Month Fitness Core',         staff_id),
  ('90000000-0000-4000-8000-000000000004', t_id, 'IPG-2004', 'Sneha Kulkarni',      '+919820100004', 'sneha.kulkarni@example.in',  date '2026-09-05', date '2026-10-04', 'active', 0, '1-Month Trial Basic',          staff_id),
  ('90000000-0000-4000-8000-000000000005', t_id, 'IPG-2005', 'Arjun Singhania',     '+919820100005', 'arjun.singhania@example.in', date '2026-09-10', date '2027-09-09', 'active', 0, '12-Month VIP Transformation',  staff_id)
on conflict (id) do update set
  member_code = excluded.member_code, full_name = excluded.full_name,
  phone_number = excluded.phone_number, email = excluded.email,
  membership_started_on = excluded.membership_started_on,
  membership_expires_on = excluded.membership_expires_on,
  status = excluded.status, balance_due_minor = excluded.balance_due_minor,
  notes = excluded.notes,
  freeze_started_on = null, freeze_resumes_on = null, freeze_reason = null;

-- Matching full-payment receipts.
insert into public.payments (
  id, tenant_id, member_id, amount_minor, currency, status, method, paid_at,
  discount_minor, cash_minor, upi_minor, total_due_minor, balance_due_minor,
  period_starts_on, period_ends_on, renewal_kind, notes, recorded_by
) values
  ('91000000-0000-4000-8000-000000000001', t_id, '90000000-0000-4000-8000-000000000001', 1800000, 'INR', 'paid', 'upi',  timestamptz '2026-08-01 10:15+05:30', 0,       0, 1800000, 1800000, 0, date '2026-08-01', date '2027-07-31', 'new_registration', 'Annual Elite joining fee',     staff_id),
  ('91000000-0000-4000-8000-000000000002', t_id, '90000000-0000-4000-8000-000000000002',  900000, 'INR', 'paid', 'cash', timestamptz '2026-08-15 11:40+05:30', 0,  900000,       0,  900000, 0, date '2026-08-15', date '2027-02-14', 'new_registration', 'Strength Pro joining fee',     staff_id),
  ('91000000-0000-4000-8000-000000000003', t_id, '90000000-0000-4000-8000-000000000003',  500000, 'INR', 'paid', 'upi',  timestamptz '2026-09-01 09:05+05:30', 0,       0,  500000,  500000, 0, date '2026-09-01', date '2026-11-30', 'new_registration', 'Fitness Core joining fee',     staff_id),
  ('91000000-0000-4000-8000-000000000004', t_id, '90000000-0000-4000-8000-000000000004',  150000, 'INR', 'paid', 'cash', timestamptz '2026-09-05 18:20+05:30', 0,  150000,       0,  150000, 0, date '2026-09-05', date '2026-10-04', 'new_registration', 'Trial Basic joining fee',      staff_id),
  ('91000000-0000-4000-8000-000000000005', t_id, '90000000-0000-4000-8000-000000000005', 2200000, 'INR', 'paid', 'upi',  timestamptz '2026-09-10 12:00+05:30', 0,       0, 2200000, 2200000, 0, date '2026-09-10', date '2027-09-09', 'new_registration', 'VIP Transformation joining fee', staff_id)
on conflict (id) do update set
  amount_minor = excluded.amount_minor, status = excluded.status,
  method = excluded.method, paid_at = excluded.paid_at,
  cash_minor = excluded.cash_minor, upi_minor = excluded.upi_minor,
  total_due_minor = excluded.total_due_minor,
  balance_due_minor = excluded.balance_due_minor, notes = excluded.notes;

-- =========================================================================
-- SEGMENT 2 — 5 partial payments carrying an outstanding balance
-- =========================================================================
insert into public.members (
  id, tenant_id, member_code, full_name, phone_number, email,
  membership_started_on, membership_expires_on, status, balance_due_minor,
  notes, created_by
) values
  ('90000000-0000-4000-8000-000000000006', t_id, 'IPG-2006', 'Rohan Deshmukh', '+919820100006', 'rohan.deshmukh@example.in', date '2026-09-01', date '2027-02-28', 'active',  600000, '6-Month plan, part paid', staff_id),
  ('90000000-0000-4000-8000-000000000007', t_id, 'IPG-2007', 'Mehul Chawla',   '+919820100007', 'mehul.chawla@example.in',   date '2026-09-03', date '2026-12-02', 'active',  400000, '3-Month plan, part paid', staff_id),
  ('90000000-0000-4000-8000-000000000008', t_id, 'IPG-2008', 'Tanvi Saxena',   '+919820100008', 'tanvi.saxena@example.in',   date '2026-09-04', date '2027-09-03', 'active', 1000000, 'Annual plan, part paid',  staff_id),
  ('90000000-0000-4000-8000-000000000009', t_id, 'IPG-2009', 'Harpreet Singh', '+919820100009', 'harpreet.singh@example.in', date '2026-09-06', date '2026-10-05', 'active',  250000, '1-Month plan, part paid', staff_id),
  ('90000000-0000-4000-8000-000000000010', t_id, 'IPG-2010', 'Farhan Akhtar',  '+919820100010', 'farhan.akhtar@example.in',  date '2026-09-07', date '2026-12-06', 'active',  500000, '3-Month plan, part paid', staff_id)
on conflict (id) do update set
  member_code = excluded.member_code, full_name = excluded.full_name,
  phone_number = excluded.phone_number, email = excluded.email,
  membership_started_on = excluded.membership_started_on,
  membership_expires_on = excluded.membership_expires_on,
  status = excluded.status, balance_due_minor = excluded.balance_due_minor,
  notes = excluded.notes,
  freeze_started_on = null, freeze_resumes_on = null, freeze_reason = null;

-- status = 'pending' so these surface in the Action Center / dues queries.
insert into public.payments (
  id, tenant_id, member_id, amount_minor, currency, status, method, paid_at,
  discount_minor, cash_minor, upi_minor, total_due_minor, balance_due_minor,
  due_settlement_date, period_starts_on, period_ends_on, renewal_kind, notes, recorded_by
) values
  ('91000000-0000-4000-8000-000000000006', t_id, '90000000-0000-4000-8000-000000000006',  400000, 'INR', 'pending', 'upi',  timestamptz '2026-09-01 17:10+05:30', 0,      0, 400000, 1000000,  600000, date '2026-09-15', date '2026-09-01', date '2027-02-28', 'new_registration', 'Partial: ₹4,000 of ₹10,000', staff_id),
  ('91000000-0000-4000-8000-000000000007', t_id, '90000000-0000-4000-8000-000000000007',  200000, 'INR', 'pending', 'cash', timestamptz '2026-09-03 19:25+05:30', 0, 200000,      0,  600000,  400000, date '2026-09-18', date '2026-09-03', date '2026-12-02', 'new_registration', 'Partial: ₹2,000 of ₹6,000',  staff_id),
  ('91000000-0000-4000-8000-000000000008', t_id, '90000000-0000-4000-8000-000000000008',  500000, 'INR', 'pending', 'upi',  timestamptz '2026-09-04 08:45+05:30', 0,      0, 500000, 1500000, 1000000, date '2026-09-20', date '2026-09-04', date '2027-09-03', 'new_registration', 'Partial: ₹5,000 of ₹15,000', staff_id),
  ('91000000-0000-4000-8000-000000000009', t_id, '90000000-0000-4000-8000-000000000009',  100000, 'INR', 'pending', 'cash', timestamptz '2026-09-06 20:05+05:30', 0, 100000,      0,  350000,  250000, date '2026-09-12', date '2026-09-06', date '2026-10-05', 'new_registration', 'Partial: ₹1,000 of ₹3,500',  staff_id),
  ('91000000-0000-4000-8000-000000000010', t_id, '90000000-0000-4000-8000-000000000010',  300000, 'INR', 'pending', 'upi',  timestamptz '2026-09-07 16:30+05:30', 0,      0, 300000,  800000,  500000, date '2026-09-25', date '2026-09-07', date '2026-12-06', 'new_registration', 'Partial: ₹3,000 of ₹8,000',  staff_id)
on conflict (id) do update set
  amount_minor = excluded.amount_minor, status = excluded.status,
  method = excluded.method, paid_at = excluded.paid_at,
  cash_minor = excluded.cash_minor, upi_minor = excluded.upi_minor,
  total_due_minor = excluded.total_due_minor,
  balance_due_minor = excluded.balance_due_minor,
  due_settlement_date = excluded.due_settlement_date, notes = excluded.notes;

-- =========================================================================
-- SEGMENT 3 — 5 expiring / expired members
-- =========================================================================
insert into public.members (
  id, tenant_id, member_code, full_name, phone_number, email,
  membership_started_on, membership_expires_on, status, balance_due_minor,
  notes, created_by
) values
  ('90000000-0000-4000-8000-000000000011', t_id, 'IPG-2011', 'Deepak Verma',  '+919820100011', 'deepak.verma@example.in',  date '2026-08-12', date '2026-09-11', 'active',  0, '1 Month — expires today',      staff_id),
  ('90000000-0000-4000-8000-000000000012', t_id, 'IPG-2012', 'Sanya Mirza',   '+919820100012', 'sanya.mirza@example.in',   date '2026-06-13', date '2026-09-12', 'active',  0, '3 Months — expires tomorrow',  staff_id),
  ('90000000-0000-4000-8000-000000000013', t_id, 'IPG-2013', 'Karan Grover',  '+919820100013', 'karan.grover@example.in',  date '2026-08-15', date '2026-09-14', 'active',  0, '1 Month — expires in 3 days',  staff_id),
  ('90000000-0000-4000-8000-000000000014', t_id, 'IPG-2014', 'Pooja Hegde',   '+919820100014', 'pooja.hegde@example.in',   date '2026-03-09', date '2026-09-08', 'expired', 0, '6 Months — expired 3 days ago',staff_id),
  ('90000000-0000-4000-8000-000000000015', t_id, 'IPG-2015', 'Nitin Gadkari', '+919820100015', 'nitin.gadkari@example.in', date '2026-07-26', date '2026-08-25', 'expired', 0, '1 Month — lapsed 17 days ago', staff_id)
on conflict (id) do update set
  member_code = excluded.member_code, full_name = excluded.full_name,
  phone_number = excluded.phone_number, email = excluded.email,
  membership_started_on = excluded.membership_started_on,
  membership_expires_on = excluded.membership_expires_on,
  status = excluded.status, balance_due_minor = excluded.balance_due_minor,
  notes = excluded.notes,
  freeze_started_on = null, freeze_resumes_on = null, freeze_reason = null;

-- =========================================================================
-- SEGMENT 4 — 5 paused members (expiry already shifted by frozen days)
-- =========================================================================
insert into public.members (
  id, tenant_id, member_code, full_name, phone_number, email,
  membership_started_on, membership_expires_on, status, balance_due_minor,
  freeze_started_on, freeze_resumes_on, freeze_reason, notes, created_by
) values
  ('90000000-0000-4000-8000-000000000016', t_id, 'IPG-2016', 'Gaurav Taneja', '+919820100016', 'gaurav.taneja@example.in', date '2026-06-01', date '2027-01-20', 'paused', 0, date '2026-09-05', date '2026-09-25', 'Medical / Injury',      'Shoulder dislocation — 20 day freeze', staff_id),
  ('90000000-0000-4000-8000-000000000017', t_id, 'IPG-2017', 'Ritu Phogat',   '+919820100017', 'ritu.phogat@example.in',   date '2026-05-20', date '2026-12-08', 'paused', 0, date '2026-09-01', date '2026-09-20', 'Travel / Relocation',   'National championship camp — 19 days', staff_id),
  ('90000000-0000-4000-8000-000000000018', t_id, 'IPG-2018', 'Aditya Roy',    '+919820100018', 'aditya.roy@example.in',    date '2026-07-10', date '2026-11-23', 'paused', 0, date '2026-09-08', date '2026-09-22', 'Exams / Academic',      'Semester exams — 14 day freeze',       staff_id),
  ('90000000-0000-4000-8000-000000000019', t_id, 'IPG-2019', 'Zoya Akhtar',   '+919820100019', 'zoya.akhtar@example.in',   date '2026-04-15', date '2027-05-03', 'paused', 0, date '2026-09-10', date '2026-09-28', 'Travel / Relocation',   'International vacation — 18 days',     staff_id),
  ('90000000-0000-4000-8000-000000000020', t_id, 'IPG-2020', 'Kunal Kamra',   '+919820100020', 'kunal.kamra@example.in',   date '2026-06-18', date '2027-01-17', 'paused', 0, date '2026-09-02', date '2026-10-02', 'Medical / Injury',      'Knee arthroscopy — 30 day max freeze', staff_id)
on conflict (id) do update set
  member_code = excluded.member_code, full_name = excluded.full_name,
  phone_number = excluded.phone_number, email = excluded.email,
  membership_started_on = excluded.membership_started_on,
  membership_expires_on = excluded.membership_expires_on,
  status = excluded.status, balance_due_minor = excluded.balance_due_minor,
  freeze_started_on = excluded.freeze_started_on,
  freeze_resumes_on = excluded.freeze_resumes_on,
  freeze_reason = excluded.freeze_reason, notes = excluded.notes;

-- Freeze audit trail: previous_expiry + frozen_days = new_expiry.
insert into public.member_freezes (
  id, tenant_id, member_id, freeze_started_on, freeze_resumes_on, frozen_days,
  reason, previous_expiry, new_expiry, recorded_by, created_at
) values
  ('92000000-0000-4000-8000-000000000001', t_id, '90000000-0000-4000-8000-000000000016', date '2026-09-05', date '2026-09-25', 20, 'Medical / Injury',    date '2026-12-31', date '2027-01-20', staff_id, timestamptz '2026-09-05 10:30+05:30'),
  ('92000000-0000-4000-8000-000000000002', t_id, '90000000-0000-4000-8000-000000000017', date '2026-09-01', date '2026-09-20', 19, 'Travel / Relocation', date '2026-11-19', date '2026-12-08', staff_id, timestamptz '2026-09-01 09:15+05:30'),
  ('92000000-0000-4000-8000-000000000003', t_id, '90000000-0000-4000-8000-000000000018', date '2026-09-08', date '2026-09-22', 14, 'Exams / Academic',    date '2026-11-09', date '2026-11-23', staff_id, timestamptz '2026-09-08 17:45+05:30'),
  ('92000000-0000-4000-8000-000000000004', t_id, '90000000-0000-4000-8000-000000000019', date '2026-09-10', date '2026-09-28', 18, 'Travel / Relocation', date '2027-04-15', date '2027-05-03', staff_id, timestamptz '2026-09-10 11:20+05:30'),
  ('92000000-0000-4000-8000-000000000005', t_id, '90000000-0000-4000-8000-000000000020', date '2026-09-02', date '2026-10-02', 30, 'Medical / Injury',    date '2026-12-18', date '2027-01-17', staff_id, timestamptz '2026-09-02 14:05+05:30')
on conflict (id) do update set
  freeze_started_on = excluded.freeze_started_on,
  freeze_resumes_on = excluded.freeze_resumes_on,
  frozen_days = excluded.frozen_days, reason = excluded.reason,
  previous_expiry = excluded.previous_expiry, new_expiry = excluded.new_expiry;

-- Joining payments for Segments 3 & 4 so no Member Ledger is ever empty.
insert into public.payments (
  id, tenant_id, member_id, amount_minor, currency, status, method, paid_at,
  discount_minor, cash_minor, upi_minor, total_due_minor, balance_due_minor,
  period_starts_on, period_ends_on, renewal_kind, notes, recorded_by
) values
  ('91000000-0000-4000-8000-000000000011', t_id, '90000000-0000-4000-8000-000000000011',  150000, 'INR', 'paid', 'cash', timestamptz '2026-08-12 10:00+05:30', 0, 150000,       0,  150000, 0, date '2026-08-12', date '2026-09-11', 'new_registration', '1-Month joining fee',   staff_id),
  ('91000000-0000-4000-8000-000000000012', t_id, '90000000-0000-4000-8000-000000000012',  500000, 'INR', 'paid', 'upi',  timestamptz '2026-06-13 11:30+05:30', 0,      0,  500000,  500000, 0, date '2026-06-13', date '2026-09-12', 'new_registration', '3-Month joining fee',   staff_id),
  ('91000000-0000-4000-8000-000000000013', t_id, '90000000-0000-4000-8000-000000000013',  180000, 'INR', 'paid', 'cash', timestamptz '2026-08-15 18:10+05:30', 0, 180000,       0,  180000, 0, date '2026-08-15', date '2026-09-14', 'new_registration', '1-Month joining fee',   staff_id),
  ('91000000-0000-4000-8000-000000000014', t_id, '90000000-0000-4000-8000-000000000014',  900000, 'INR', 'paid', 'upi',  timestamptz '2026-03-09 09:20+05:30', 0,      0,  900000,  900000, 0, date '2026-03-09', date '2026-09-08', 'new_registration', '6-Month joining fee',   staff_id),
  ('91000000-0000-4000-8000-000000000015', t_id, '90000000-0000-4000-8000-000000000015',  160000, 'INR', 'paid', 'cash', timestamptz '2026-07-26 16:40+05:30', 0, 160000,       0,  160000, 0, date '2026-07-26', date '2026-08-25', 'new_registration', '1-Month joining fee',   staff_id),
  ('91000000-0000-4000-8000-000000000016', t_id, '90000000-0000-4000-8000-000000000016', 1400000, 'INR', 'paid', 'upi',  timestamptz '2026-06-01 08:45+05:30', 0,      0, 1400000, 1400000, 0, date '2026-06-01', date '2026-12-31', 'new_registration', 'Annual joining fee',    staff_id),
  ('91000000-0000-4000-8000-000000000017', t_id, '90000000-0000-4000-8000-000000000017',  950000, 'INR', 'paid', 'cash', timestamptz '2026-05-20 19:05+05:30', 0, 950000,       0,  950000, 0, date '2026-05-20', date '2026-11-19', 'new_registration', '6-Month joining fee',   staff_id),
  ('91000000-0000-4000-8000-000000000018', t_id, '90000000-0000-4000-8000-000000000018',  550000, 'INR', 'paid', 'upi',  timestamptz '2026-07-10 12:15+05:30', 0,      0,  550000,  550000, 0, date '2026-07-10', date '2026-11-09', 'new_registration', '4-Month joining fee',   staff_id),
  ('91000000-0000-4000-8000-000000000019', t_id, '90000000-0000-4000-8000-000000000019', 1800000, 'INR', 'paid', 'upi',  timestamptz '2026-04-15 10:50+05:30', 0,      0, 1800000, 1800000, 0, date '2026-04-15', date '2027-04-15', 'new_registration', 'Annual joining fee',    staff_id),
  ('91000000-0000-4000-8000-000000000020', t_id, '90000000-0000-4000-8000-000000000020', 1200000, 'INR', 'paid', 'cash', timestamptz '2026-06-18 17:25+05:30', 0,1200000,       0, 1200000, 0, date '2026-06-18', date '2026-12-18', 'new_registration', '6-Month joining fee',   staff_id)
on conflict (id) do update set
  amount_minor = excluded.amount_minor, status = excluded.status,
  method = excluded.method, paid_at = excluded.paid_at,
  cash_minor = excluded.cash_minor, upi_minor = excluded.upi_minor,
  total_due_minor = excluded.total_due_minor,
  balance_due_minor = excluded.balance_due_minor, notes = excluded.notes;

-- =========================================================================
-- SEGMENT 5 — 5 split (cash + UPI) transactions
-- =========================================================================
insert into public.members (
  id, tenant_id, member_code, full_name, phone_number, email,
  membership_started_on, membership_expires_on, status, balance_due_minor,
  notes, created_by
) values
  ('90000000-0000-4000-8000-000000000021', t_id, 'IPG-2021', 'Sameer Nair',    '+919820100021', 'sameer.nair@example.in',    date '2026-09-11', date '2026-12-10', 'active', 0, '3 Months — split tender', staff_id),
  ('90000000-0000-4000-8000-000000000022', t_id, 'IPG-2022', 'Divya Agarwal',  '+919820100022', 'divya.agarwal@example.in',  date '2026-09-10', date '2027-03-09', 'active', 0, '6 Months — split tender', staff_id),
  ('90000000-0000-4000-8000-000000000023', t_id, 'IPG-2023', 'Varun Dhawan',   '+919820100023', 'varun.dhawan@example.in',   date '2026-09-10', date '2026-10-09', 'active', 0, '1 Month — split tender',  staff_id),
  ('90000000-0000-4000-8000-000000000024', t_id, 'IPG-2024', 'Kavita Kaushik', '+919820100024', 'kavita.kaushik@example.in', date '2026-09-09', date '2027-09-08', 'active', 0, 'Annual — split tender',   staff_id),
  ('90000000-0000-4000-8000-000000000025', t_id, 'IPG-2025', 'Manish Paul',    '+919820100025', 'manish.paul@example.in',    date '2026-09-09', date '2026-12-08', 'active', 0, '3 Months — split tender', staff_id)
on conflict (id) do update set
  member_code = excluded.member_code, full_name = excluded.full_name,
  phone_number = excluded.phone_number, email = excluded.email,
  membership_started_on = excluded.membership_started_on,
  membership_expires_on = excluded.membership_expires_on,
  status = excluded.status, balance_due_minor = excluded.balance_due_minor,
  notes = excluded.notes,
  freeze_started_on = null, freeze_resumes_on = null, freeze_reason = null;

insert into public.payments (
  id, tenant_id, member_id, amount_minor, currency, status, method, paid_at,
  discount_minor, cash_minor, upi_minor, total_due_minor, balance_due_minor,
  period_starts_on, period_ends_on, renewal_kind, notes, recorded_by
) values
  ('91000000-0000-4000-8000-000000000021', t_id, '90000000-0000-4000-8000-000000000021',  600000, 'INR', 'paid', 'cash', timestamptz '2026-09-11 01:10+05:30', 0, 200000, 400000,  600000, 0, date '2026-09-11', date '2026-12-10', 'new_registration', 'Split: ₹2,000 cash + ₹4,000 UPI',  staff_id),
  ('91000000-0000-4000-8000-000000000022', t_id, '90000000-0000-4000-8000-000000000022', 1000000, 'INR', 'paid', 'cash', timestamptz '2026-09-10 20:30+05:30', 0, 500000, 500000, 1000000, 0, date '2026-09-10', date '2027-03-09', 'new_registration', 'Split: ₹5,000 cash + ₹5,000 UPI',  staff_id),
  ('91000000-0000-4000-8000-000000000023', t_id, '90000000-0000-4000-8000-000000000023',  200000, 'INR', 'paid', 'cash', timestamptz '2026-09-10 17:45+05:30', 0,  50000, 150000,  200000, 0, date '2026-09-10', date '2026-10-09', 'new_registration', 'Split: ₹500 cash + ₹1,500 UPI',    staff_id),
  ('91000000-0000-4000-8000-000000000024', t_id, '90000000-0000-4000-8000-000000000024', 1600000, 'INR', 'paid', 'cash', timestamptz '2026-09-09 19:15+05:30', 0, 600000,1000000, 1600000, 0, date '2026-09-09', date '2027-09-08', 'new_registration', 'Split: ₹6,000 cash + ₹10,000 UPI', staff_id),
  ('91000000-0000-4000-8000-000000000025', t_id, '90000000-0000-4000-8000-000000000025',  550000, 'INR', 'paid', 'cash', timestamptz '2026-09-09 11:00+05:30', 0, 150000, 400000,  550000, 0, date '2026-09-09', date '2026-12-08', 'new_registration', 'Split: ₹1,500 cash + ₹4,000 UPI',  staff_id)
on conflict (id) do update set
  amount_minor = excluded.amount_minor, status = excluded.status,
  method = excluded.method, paid_at = excluded.paid_at,
  cash_minor = excluded.cash_minor, upi_minor = excluded.upi_minor,
  total_due_minor = excluded.total_due_minor,
  balance_due_minor = excluded.balance_due_minor, notes = excluded.notes;

-- =========================================================================
-- SEGMENT 6 — 5 petty cash / drawer expenses (total ₹1,250 today)
-- =========================================================================
insert into public.expenses (id, tenant_id, amount_minor, category, note, spent_at, recorded_by, status, approved_by_user_id, approved_at) values
  ('93000000-0000-4000-8000-000000000001', t_id, 20000, 'water_camper',  '2 Bisleri water cans for gym floor',                       timestamptz '2026-09-11 07:30+05:30', staff_id, 'APPROVED', '20000000-0000-4000-8000-000000000001', timestamptz '2026-09-11 12:00+05:30'),
  ('93000000-0000-4000-8000-000000000002', t_id, 35000, 'housekeeping',  'Floor cleaner disinfectant and microfiber cloths',         timestamptz '2026-09-11 08:15+05:30', staff_id, 'APPROVED', '20000000-0000-4000-8000-000000000001', timestamptz '2026-09-11 12:00+05:30'),
  ('93000000-0000-4000-8000-000000000003', t_id, 45000, 'repairs',       'Cable crossover pulley replacement screw and lubrication', timestamptz '2026-09-11 09:40+05:30', staff_id, 'APPROVED', '20000000-0000-4000-8000-000000000001', timestamptz '2026-09-11 12:00+05:30'),
  ('93000000-0000-4000-8000-000000000004', t_id, 15000, 'staff_advance', 'Evening snacks & tea for floor staff',                     timestamptz '2026-09-11 10:20+05:30', staff_id, 'APPROVED', '20000000-0000-4000-8000-000000000001', timestamptz '2026-09-11 12:00+05:30'),
  ('93000000-0000-4000-8000-000000000005', t_id, 10000, 'other',         'First aid cotton bandages and pain relief spray',          timestamptz '2026-09-11 11:05+05:30', staff_id, 'APPROVED', '20000000-0000-4000-8000-000000000001', timestamptz '2026-09-11 12:00+05:30')
on conflict (id) do update set
  amount_minor = excluded.amount_minor, category = excluded.category,
  note = excluded.note, spent_at = excluded.spent_at,
  status = excluded.status,
  approved_by_user_id = excluded.approved_by_user_id,
  approved_at = excluded.approved_at;

-- =========================================================================
-- SEGMENT 7 — 5 public leads / enquiries
-- =========================================================================
insert into public.leads (id, tenant_id, full_name, phone_number, source, goal, request, status, created_at) values
  ('94000000-0000-4000-8000-000000000001', t_id, 'Aryan Khan',    '+919820111223', 'Instagram Ad',       'Weight Loss',            '1-Day Free Trial',        'new',             timestamptz '2026-09-11 09:10+05:30'),
  ('94000000-0000-4000-8000-000000000002', t_id, 'Tara Sutaria',  '+919820222334', 'Google Maps',        'Pilates & Strength',     'Pricing Enquiry',         'contacted',       timestamptz '2026-09-10 15:35+05:30'),
  ('94000000-0000-4000-8000-000000000003', t_id, 'Ishan Kishan',  '+919820333445', 'QR Banner / Walk-in','Muscle Gain',            'Evening Slot Trial',      'trial_scheduled', timestamptz '2026-09-10 12:20+05:30'),
  ('94000000-0000-4000-8000-000000000004', t_id, 'Alia Bhatt',    '+919820444556', 'Website Link',       'Cardio & Flexibility',   'Women Only Batch Enquiry','new',             timestamptz '2026-09-09 18:05+05:30'),
  ('94000000-0000-4000-8000-000000000005', t_id, 'Shubman Gill',  '+919820555667', 'Friend Referral',    'Athletic Conditioning',  'Direct Onboarding',       'converted',       timestamptz '2026-09-09 10:45+05:30')
on conflict (id) do update set
  full_name = excluded.full_name, phone_number = excluded.phone_number,
  source = excluded.source, goal = excluded.goal, request = excluded.request,
  status = excluded.status, created_at = excluded.created_at;

-- =========================================================================
-- SEGMENT 8 — 5 live check-ins today (checked_out_at null => "In Gym")
-- =========================================================================
insert into public.attendance (id, tenant_id, member_id, checked_in_at, checked_out_at, source, notes, recorded_by) values
  ('95000000-0000-4000-8000-000000000001', t_id, '90000000-0000-4000-8000-000000000001', timestamptz '2026-09-11 01:05+05:30', null, 'reception', 'Access granted',                     staff_id),
  ('95000000-0000-4000-8000-000000000002', t_id, '90000000-0000-4000-8000-000000000003', timestamptz '2026-09-11 01:12+05:30', null, 'reception', 'Access granted',                     staff_id),
  ('95000000-0000-4000-8000-000000000003', t_id, '90000000-0000-4000-8000-000000000004', timestamptz '2026-09-11 01:18+05:30', null, 'reception', 'Access granted',                     staff_id),
  ('95000000-0000-4000-8000-000000000004', t_id, '90000000-0000-4000-8000-000000000002', timestamptz '2026-09-11 01:25+05:30', null, 'reception', 'Access granted',                     staff_id),
  ('95000000-0000-4000-8000-000000000005', t_id, '90000000-0000-4000-8000-000000000011', timestamptz '2026-09-11 01:30+05:30', null, 'reception', 'WARNING_EXPIRING — plan ends today', staff_id)
on conflict (id) do update set
  checked_in_at = excluded.checked_in_at, checked_out_at = excluded.checked_out_at,
  notes = excluded.notes;

-- =========================================================================
-- SEGMENT 9 — 5 notification / audit feed entries
-- =========================================================================
insert into public.notifications (id, tenant_id, kind, title, body, severity, member_id, is_read, created_at) values
  ('96000000-0000-4000-8000-000000000001', t_id, 'URGENT_DUE',   'Pending Due Reminder',      'Harpreet Singh has ₹2,500 due payable by 12 Sep 2026.',          'high',    '90000000-0000-4000-8000-000000000009', false, timestamptz '2026-09-11 08:00+05:30'),
  ('96000000-0000-4000-8000-000000000002', t_id, 'EXPIRY_ALERT', 'Membership Expiring Today', 'Deepak Verma (IPG-2011) plan ends today.',                       'amber',   '90000000-0000-4000-8000-000000000011', false, timestamptz '2026-09-11 08:05+05:30'),
  ('96000000-0000-4000-8000-000000000003', t_id, 'LEAD_ALERT',   'New Trial Request',         'Aryan Khan submitted 1-Day Trial request from Instagram.',       'info',    null,                                   false, timestamptz '2026-09-11 09:12+05:30'),
  ('96000000-0000-4000-8000-000000000004', t_id, 'CASH_DRAWER',  'Expense Recorded',          '₹450 deducted for cable crossover repair.',                      'info',    null,                                   false, timestamptz '2026-09-11 09:41+05:30'),
  ('96000000-0000-4000-8000-000000000005', t_id, 'FREEZE_LOG',   'Plan Paused',               'Gaurav Taneja''s membership paused for 20 days (Medical).',      'neutral', '90000000-0000-4000-8000-000000000016', true,  timestamptz '2026-09-05 10:31+05:30')
on conflict (id) do update set
  kind = excluded.kind, title = excluded.title, body = excluded.body,
  severity = excluded.severity, member_id = excluded.member_id,
  is_read = excluded.is_read, created_at = excluded.created_at;

raise notice 'GymOS comprehensive fixture seeded for tenant % (reference date %)', t_id, today;

end
$$;

commit;

-- ===========================================================================
-- PHASE 2 — Owner Cockpit fixtures (idempotent, 9xxxxxxx- reserved prefix)
-- ===========================================================================
-- Auth identities for the new owner + trainer. public.users mirrors auth.users
-- via FK, so the auth row must exist first.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000010',
   'authenticated', 'authenticated', 'rajesh.owner@ironparadise.com',
   extensions.crypt('GymOS-Test-2026!', extensions.gen_salt('bf')), now(), now(),
   jsonb_build_object('provider','email','providers',jsonb_build_array('email'),
     'tenant_id','10000000-0000-4000-8000-000000000001','role','owner'),
   jsonb_build_object('full_name','Rajesh Sharma'), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000011',
   'authenticated', 'authenticated', 'vikram.trainer@ironparadise.com',
   extensions.crypt('GymOS-Test-2026!', extensions.gen_salt('bf')), now(), now(),
   jsonb_build_object('provider','email','providers',jsonb_build_array('email'),
     'tenant_id','10000000-0000-4000-8000-000000000001','role','trainer'),
   jsonb_build_object('full_name','Vikram Singh'), now(), now(), '', '', '', '')
on conflict (id) do update set
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data;

insert into public.users (id, tenant_id, role, full_name, phone_number, commission_rate_pct)
values
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001',
   'owner', 'Rajesh Sharma', '+919820200010', 0.00),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001',
   'trainer', 'Vikram Singh', '+919820200011', 20.00)
on conflict (id) do update set
  role = excluded.role,
  full_name = excluded.full_name,
  phone_number = excluded.phone_number,
  commission_rate_pct = excluded.commission_rate_pct;

-- Two active members coached by Vikram Singh.
update public.members
set assigned_trainer_id = '20000000-0000-4000-8000-000000000011'
where id in (
  '90000000-0000-4000-8000-000000000018',  -- Aditya Roy
  '90000000-0000-4000-8000-000000000005'   -- Arjun Singhania
);

-- One closed (LOCKED) shift and one live OPEN shift for Meera Joshi.
-- Opening 2,000 + cash-in 1,000 − petty 200 = 2,800 expected; counted 2,750 => −50.
insert into public.shifts (
  id, tenant_id, staff_id, opened_at, closed_at, opening_cash_minor,
  system_cash_in_minor, petty_expenses_minor, actual_cash_minor, variance_minor,
  status, notes
) values
  ('97000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000002',
   timestamptz '2026-09-10 06:00+05:30', timestamptz '2026-09-10 22:15+05:30',
   200000, 100000, 20000, 275000, -5000, 'LOCKED', 'Verified by owner; ₹50 short'),
  ('97000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000002',
   timestamptz '2026-09-11 06:00+05:30', null,
   200000, 0, 0, null, null, 'OPEN', 'Morning desk shift'),
  -- Handed over by the trainer-owned desk slot so the owner has a shift that is
  -- actually lockable in the cockpit (one OPEN shift per staff is enforced).
  ('97000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000011',
   timestamptz '2026-09-11 14:00+05:30', null,
   200000, 100000, 20000, null, null, 'HANDED_OVER', 'Evening desk handover — awaiting owner count')
on conflict (id) do update set
  opened_at = excluded.opened_at, closed_at = excluded.closed_at,
  opening_cash_minor = excluded.opening_cash_minor,
  system_cash_in_minor = excluded.system_cash_in_minor,
  petty_expenses_minor = excluded.petty_expenses_minor,
  actual_cash_minor = excluded.actual_cash_minor,
  variance_minor = excluded.variance_minor,
  status = excluded.status, notes = excluded.notes;

-- Link today's petty expenses to the OPEN shift; leave them awaiting review so
-- the owner approval queue has real work in it.
update public.expenses
set shift_id = '97000000-0000-4000-8000-000000000002',
    status = 'PENDING_APPROVAL',
    approved_by_user_id = null,
    approved_at = null
where id in ('93000000-0000-4000-8000-000000000003',
             '93000000-0000-4000-8000-000000000004');

-- Attach a split payment to the OPEN shift for handover aggregation testing.
update public.payments
set shift_id = '97000000-0000-4000-8000-000000000002'
where id = '91000000-0000-4000-8000-000000000021';

-- A PT sale + matching trainer payout for commission plumbing.
update public.payments set is_pt_plan = true
where id = '91000000-0000-4000-8000-000000000005';

insert into public.trainer_payouts (
  id, tenant_id, trainer_id, amount_minor, period_start, period_end,
  paid_at, payment_mode, notes
) values
  ('98000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000011', 440000, date '2026-08-01', date '2026-08-31',
   timestamptz '2026-09-01 11:00+05:30', 'BANK_TRANSFER',
   'August PT commission @ 20% on ₹22,000')
on conflict (id) do update set
  amount_minor = excluded.amount_minor, period_start = excluded.period_start,
  period_end = excluded.period_end, payment_mode = excluded.payment_mode,
  notes = excluded.notes;

-- Tenant branding used on receipts and due reminders.
update public.tenants
set address = 'Shop 4, Ground Floor, MI Road, Jaipur, Rajasthan 302001',
    support_phone = '+919820100000',
    upi_id = 'ironparadise@upi'
where tenant_id = '10000000-0000-4000-8000-000000000001';
