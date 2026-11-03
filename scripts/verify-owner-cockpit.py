"""Owner Cockpit foundation — direct SQL assertion suite.

Runs every check against the live database as the real Postgres roles, using
`set local role authenticated` plus a forged JWT claim so RLS and the
SECURITY DEFINER role guards are exercised exactly as the app would hit them.
"""

import json
import urllib.parse
import uuid

import psycopg2

PW = urllib.parse.quote("Piyush@1973m", safe="")
DSN = (
    f"postgresql://postgres.udswbuuhrrfmwtkearbl:{PW}"
    "@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
)

T1 = "10000000-0000-4000-8000-000000000001"
OWNER = "20000000-0000-4000-8000-000000000001"      # Aarav Sharma
RECEPTION = "20000000-0000-4000-8000-000000000002"  # Meera Joshi

results = {}


def mark(key, ok, note=""):
    if results.get(key) is not False:
        results[key] = ok
    print(f"  [{'PASS' if ok else 'FAIL'}] {key}" + (f" — {note}" if note else ""))


def claims(conn, user_id, role, tenant=T1):
    """Impersonate an authenticated user so RLS and JWT guards apply."""
    cur = conn.cursor()
    cur.execute("set local role authenticated")
    cur.execute(
        "select set_config('request.jwt.claims', %s, true)",
        (json.dumps({"sub": user_id, "role": "authenticated",
                     "app_metadata": {"tenant_id": tenant, "role": role}}),),
    )
    return cur


def main():
    conn = psycopg2.connect(DSN, connect_timeout=30)
    conn.autocommit = False
    admin = conn.cursor()

    # ---------------------------------------------------------------- setup
    # A unique index permits only one OPEN shift per staff member (by design),
    # so the harness uses a dedicated test staff account rather than colliding
    # with the seeded desk shift.
    admin.execute("select id from public.users where tenant_id=%s and role='trainer' limit 1", (T1,))
    test_staff = admin.fetchone()[0]
    shift_id = str(uuid.uuid4())
    admin.execute("delete from public.shifts where tenant_id=%s and staff_id=%s", (T1, test_staff))
    admin.execute(
        """insert into public.shifts
           (id, tenant_id, staff_id, opening_cash_minor, status)
           values (%s, %s, %s, 200000, 'OPEN')""",
        (shift_id, T1, test_staff),
    )
    # One cash payment (₹1,000) + one split (₹400 cash of ₹1,000) => ₹1,400 cash.
    pay_cash, pay_split = str(uuid.uuid4()), str(uuid.uuid4())
    member = admin.execute(
        "select id from public.members where tenant_id=%s limit 1", (T1,)
    ) or admin.fetchone()[0]
    admin.execute(
        """insert into public.payments
           (id, tenant_id, member_id, amount_minor, currency, status, method,
            paid_at, discount_minor, cash_minor, upi_minor, recorded_by, shift_id)
           values (%s,%s,%s,100000,'INR','paid','cash',now(),0,0,0,%s,%s),
                  (%s,%s,%s,100000,'INR','paid','cash',now(),0,40000,60000,%s,%s)""",
        (pay_cash, T1, member, RECEPTION, shift_id,
         pay_split, T1, member, RECEPTION, shift_id),
    )
    exp_ok, exp_rej = str(uuid.uuid4()), str(uuid.uuid4())
    admin.execute(
        """insert into public.expenses
           (id, tenant_id, amount_minor, category, note, recorded_by, shift_id, status)
           values (%s,%s,30000,'repairs','Belt repair',%s,%s,'PENDING_APPROVAL'),
                  (%s,%s,20000,'other','Disputed item',%s,%s,'PENDING_APPROVAL')""",
        (exp_ok, T1, RECEPTION, shift_id, exp_rej, T1, RECEPTION, shift_id),
    )
    conn.commit()

    # ------------------------------------------------------------ 3 handover
    print("\n=== 3. handover_shift aggregation ===")
    cur = claims(conn, RECEPTION, "receptionist")
    cur.execute("select * from public.handover_shift(%s, %s)", (shift_id, "Desk close"))
    row = cur.fetchone()
    cols = [d[0] for d in cur.description]
    s = dict(zip(cols, row))
    conn.commit()
    mark("3a. cash-in aggregated (cash + split-cash only)",
         s["system_cash_in_minor"] == 140000,
         f"₹{s['system_cash_in_minor']/100:,.0f} (expect ₹1,400 — UPI excluded)")
    mark("3b. petty expenses aggregated", s["petty_expenses_minor"] == 50000,
         f"₹{s['petty_expenses_minor']/100:,.0f}")
    mark("3c. status OPEN -> HANDED_OVER", s["status"] == "HANDED_OVER", s["status"])

    # -------------------------------------------------------- 5 review_expense
    print("\n=== 5. review_expense authorization + state ===")
    cur = claims(conn, RECEPTION, "receptionist")
    try:
        cur.execute("select public.review_expense(%s,'APPROVE',null)", (exp_ok,))
        mark("5a. receptionist blocked from reviewing", False, "was allowed")
        conn.rollback()
    except psycopg2.Error as exc:
        conn.rollback()
        mark("5a. receptionist blocked from reviewing", True, str(exc).strip()[:52])

    cur = claims(conn, OWNER, "owner")
    cur.execute("select status, approved_by_user_id from public.review_expense(%s,'APPROVE',null)",
                (exp_ok,))
    got = cur.fetchone()
    conn.commit()
    mark("5b. owner APPROVE sets status + approver",
         got[0] == "APPROVED" and str(got[1]) == OWNER, f"{got[0]}")

    cur = claims(conn, OWNER, "owner")
    try:
        cur.execute("select public.review_expense(%s,'REJECT',null)", (exp_rej,))
        mark("5c. REJECT without reason blocked", False, "was allowed")
        conn.rollback()
    except psycopg2.Error as exc:
        conn.rollback()
        mark("5c. REJECT without reason blocked", True, str(exc).strip()[:48])

    cur = claims(conn, OWNER, "owner")
    cur.execute("select status from public.review_expense(%s,'REJECT','Not a gym cost')",
                (exp_rej,))
    rej = cur.fetchone()[0]
    cur.execute("select petty_expenses_minor from public.shifts where id=%s", (shift_id,))
    petty_after = cur.fetchone()[0]
    conn.commit()
    mark("5d. REJECT recalculates drawer",
         rej == "REJECTED" and petty_after == 30000,
         f"petty ₹{petty_after/100:,.0f} (₹500 -> ₹300 after rejection)")

    # ------------------------------------------------------- 4 verify_and_lock
    print("\n=== 4. verify_and_lock_shift variance ===")
    cur = claims(conn, RECEPTION, "receptionist")
    try:
        cur.execute("select public.verify_and_lock_shift(%s, 100000, null)", (shift_id,))
        mark("4a. receptionist blocked from locking", False, "was allowed")
        conn.rollback()
    except psycopg2.Error as exc:
        conn.rollback()
        mark("4a. receptionist blocked from locking", True, str(exc).strip()[:50])

    # expected = 2000 opening + 1400 cash-in - 300 petty = 3100; count 3050 => -50
    cur = claims(conn, OWNER, "owner")
    cur.execute("select * from public.verify_and_lock_shift(%s, %s, %s)",
                (shift_id, 305000, "Counted by owner"))
    row = cur.fetchone()
    locked = dict(zip([d[0] for d in cur.description], row))
    conn.commit()
    expected = 200000 + 140000 - 30000
    mark("4b. variance = actual − (opening + in − petty)",
         locked["variance_minor"] == 305000 - expected,
         f"actual ₹3,050 − expected ₹{expected/100:,.0f} = ₹{locked['variance_minor']/100:,.0f}")
    mark("4c. status LOCKED + closed_at set",
         locked["status"] == "LOCKED" and locked["closed_at"] is not None)

    print("\n=== 4d. locked shift immutability ===")
    cur = claims(conn, OWNER, "owner")
    try:
        cur.execute("update public.payments set notes='tamper' where id=%s", (pay_cash,))
        mark("4d. payment in locked shift frozen", False, "update succeeded")
        conn.rollback()
    except psycopg2.Error as exc:
        conn.rollback()
        mark("4d. payment in locked shift frozen", True, str(exc).strip()[:52])

    cur = claims(conn, OWNER, "owner")
    try:
        cur.execute("select public.verify_and_lock_shift(%s, 1, null)", (shift_id,))
        mark("4e. double-lock blocked", False, "was allowed")
        conn.rollback()
    except psycopg2.Error as exc:
        conn.rollback()
        mark("4e. double-lock blocked", True, str(exc).strip()[:46])

    # ------------------------------------------------------ 6 receipt lookup
    print("\n=== 6. verify_receipt_authenticity ===")
    admin2 = conn.cursor()
    admin2.execute(
        "select receipt_security_code, id from public.payments where id=%s", (pay_split,)
    )
    sec, pid = admin2.fetchone()
    rct = "RCT-" + str(pid).replace("-", "")[:12].upper()
    conn.commit()

    for label, query in [("SEC- code", sec), ("RCT- number", rct)]:
        cur = claims(conn, OWNER, "owner")
        cur.execute("select * from public.verify_receipt_authenticity(%s)", (query,))
        rows = cur.fetchall()
        conn.commit()
        if not rows:
            mark(f"6. resolves {label}", False, "no rows")
            continue
        r = dict(zip([d[0] for d in cur.description], rows[0]))
        ok = (str(r["payment_id"]) == str(pid) and r["issued_by"] == "Meera Joshi"
              and r["tender_mode"] == "SPLIT" and r["is_locked"] is True
              and r["cash_minor"] == 40000 and r["upi_minor"] == 60000)
        mark(f"6. resolves {label}", ok,
             f"{r['tender_mode']} ₹{r['cash_minor']/100:.0f}c+₹{r['upi_minor']/100:.0f}u "
             f"by {r['issued_by']}, locked={r['is_locked']}")

    cur = claims(conn, RECEPTION, "receptionist")
    cur.execute("select count(*) from public.verify_receipt_authenticity(%s)", ("SEC-0000-0000",))
    mark("6c. unknown code returns no rows", cur.fetchone()[0] == 0)
    conn.commit()

    # cross-tenant isolation
    cur = claims(conn, OWNER, "owner", tenant="10000000-0000-4000-8000-000000000002")
    cur.execute("select count(*) from public.verify_receipt_authenticity(%s)", (sec,))
    mark("6d. cross-tenant receipt hidden", cur.fetchone()[0] == 0)
    conn.commit()

    # ------------------------------------------------------------- teardown
    admin3 = conn.cursor()
    admin3.execute("update public.shifts set status='OPEN', actual_cash_minor=null, closed_at=null where id=%s", (shift_id,))
    admin3.execute("delete from public.payments where id in (%s,%s)", (pay_cash, pay_split))
    admin3.execute("delete from public.expenses where id in (%s,%s)", (exp_ok, exp_rej))
    admin3.execute("delete from public.shifts where id=%s", (shift_id,))
    conn.commit()
    conn.close()

    failed = [k for k, v in results.items() if not v]
    print(f"\n===== {len(results) - len(failed)}/{len(results)} PASS =====")
    if failed:
        print("FAILURES:", ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
