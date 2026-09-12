import { redirect } from 'next/navigation';

/**
 * Alias for the staff ledger.
 *
 * The canonical page lives at /staff-activity. This route exists so
 * the documented /staff/profile path also resolves.
 */
export const dynamic = 'force-dynamic';

export default function StaffProfileAliasPage() {
  redirect('/staff-activity');
}
