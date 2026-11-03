import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Root redirect.
 *
 * Middleware already routes `/` by role, so this normally never runs. It is
 * kept role-aware anyway: this file previously sent *everyone* to `/dashboard`,
 * which is how owners kept landing on the front desk and having to switch
 * across by hand.
 */
export default async function HomePage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect('/login');
  if (currentUser.role === 'superadmin') redirect('/superadmin');
  if (currentUser.role === 'owner') redirect('/owner/dashboard');

  redirect('/dashboard');
}
