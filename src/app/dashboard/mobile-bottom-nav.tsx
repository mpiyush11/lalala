'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  icon: string;
  label: string;
  match: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    icon: '🏠',
    label: 'Desk',
    match: (pathname) => pathname === '/dashboard',
  },
  {
    href: '/dashboard/members',
    icon: '👥',
    label: 'Members',
    match: (pathname) => pathname.startsWith('/dashboard/members'),
  },
  {
    href: '/dashboard/payments',
    icon: '💳',
    label: 'Payments',
    match: (pathname) => pathname.startsWith('/dashboard/payments'),
  },
  {
    href: '/staff-activity',
    icon: '👤',
    label: 'Profile',
    match: (pathname) => pathname.startsWith('/staff-activity'),
  },
];

/**
 * Thumb-reachable bottom tab bar for phones.
 *
 * Hidden at >= 640px via `sm:hidden` so desktop keeps the existing top nav.
 * A matching spacer is rendered by consumers so fixed positioning never covers
 * the last row of content.
 */
export function MobileBottomNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md sm:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.match(pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex h-full min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition active:scale-[0.98] ${
              isActive ? 'text-accent' : 'text-slate-500'
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}

    </nav>
  );
}

/** Reserves space so fixed bottom navigation never overlaps page content. */
export function MobileBottomNavSpacer() {
  return <div aria-hidden="true" className="h-20 sm:hidden" />;
}
