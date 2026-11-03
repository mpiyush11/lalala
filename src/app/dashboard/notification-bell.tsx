'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Static notification popover.
 *
 * Deliberately DUMB: no queries, no RLS-scoped props, no dues or expiry feed.
 * Every previous attempt to surface real "needs attention" data here blew out
 * the popover's height and fought the header layout, so the feed is fixed at
 * three generic rows until a real notifications table exists.
 *
 * Read state is client-only and does not survive a refresh — there is no row to
 * persist it against, and faking persistence would be worse than not having it.
 */
const NOTIFICATIONS = [
  {
    detail: 'Rohan applied for Trial',
    id: 'notification-web-lead',
    time: '2m ago',
    title: 'New Web Lead',
    tone: 'bg-[#8B5CF6]',
  },
  {
    detail: 'UPI timeout for Arjun Mehta',
    id: 'notification-payment-failed',
    time: '15m ago',
    title: 'Payment Failed',
    tone: 'bg-rose-400',
  },
  {
    detail: 'System auto-saved at 06:00 AM',
    id: 'notification-shift-reconciled',
    time: '2h ago',
    title: 'Shift Reconciled',
    tone: 'bg-emerald-400',
  },
] as const;

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = NOTIFICATIONS.filter(
    (notification) => !readIds.includes(notification.id),
  ).length;

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Notifications: ${unreadCount} unread`}
        data-testid="notification-bell"
        className="relative grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-full bg-transparent text-zinc-400 transition hover:text-white active:scale-[0.98] sm:h-10 sm:w-10 sm:min-h-0 sm:min-w-0"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[#7C3AED] shadow-[0_0_8px_rgba(124,92,246,0.9)]" />
        ) : null}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Notifications"
          data-testid="notification-popover"
          className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111113] shadow-2xl shadow-black/60"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <button
              type="button"
              onClick={() => setReadIds(NOTIFICATIONS.map((notification) => notification.id))}
              disabled={unreadCount === 0}
              data-testid="mark-all-read"
              className="text-[10px] font-medium text-[#8B5CF6] transition hover:text-[#6D28D9] disabled:opacity-50"
            >
              Mark all as read
            </button>
          </div>

          <ul className="divide-y divide-white/[0.05]" data-testid="notification-list">
            {NOTIFICATIONS.map((notification) => {
              const isRead = readIds.includes(notification.id);

              return (
                <li key={notification.id} className="flex items-start gap-2.5 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${notification.tone}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-xs ${
                        isRead ? 'font-normal text-zinc-500' : 'font-medium text-zinc-200'
                      }`}
                    >
                      {notification.title}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500">{notification.detail}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono tabular-nums text-zinc-500 tracking-normal">
                    {notification.time}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-white/[0.06]">
            <button
              type="button"
              data-testid="view-all-notifications"
              className="w-full py-2.5 text-center text-[11px] text-zinc-500 transition hover:text-zinc-300"
            >
              View all notifications
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
