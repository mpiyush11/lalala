import { redirect } from 'next/navigation';

/** Legacy path: the staff ledger now lives at /staff-activity. */
export const dynamic = 'force-dynamic';

export default function LegacyStaffActivityPage() {
  redirect('/staff-activity');
}
