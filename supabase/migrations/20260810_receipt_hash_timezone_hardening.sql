begin;

-- Timestamp text rendering depends on the session timezone. Pin both hash
-- creation and verification to UTC so canonical receipt hashes are stable.
alter function public.set_payment_receipt_hash()
  set timezone = 'UTC';

alter function public.verify_payment_receipt(uuid)
  set timezone = 'UTC';

-- Recompute existing receipt hashes under the pinned canonical timezone.
update public.payments
set amount_minor = amount_minor;

commit;
