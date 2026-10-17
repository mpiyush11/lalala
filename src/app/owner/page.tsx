import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** /owner is an alias for the cockpit landing page. */
export default function OwnerIndexPage() {
  redirect('/owner/dashboard');
}
