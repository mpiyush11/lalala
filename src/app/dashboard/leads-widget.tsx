'use client';

import Link from 'next/link';
import { useState } from 'react';

import { toWhatsAppNumber } from '@/lib/notifications/whatsapp';

export type DeskLead = {
  createdAt: string;
  fullName: string;
  goal: string | null;
  id: string;
  phoneNumber: string;
  request: string | null;
  source: string;
  status: string;
};

/** "10m ago", "2h ago", "3d ago" — compact relative age for the desk feed. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  const mins = Math.round(diffMs / 60_000);

  if (!Number.isFinite(mins)) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

const SOURCE_STYLE: Record<string, string> = {
  'Friend Referral': 'bg-emerald-400/10 text-emerald-300',
  'Google Maps': 'bg-blue-400/10 text-blue-300',
  'Instagram Ad': 'bg-pink-400/10 text-pink-300',
  'QR Banner / Walk-in': 'bg-amber-400/10 text-amber-300',
  'Website Link': 'bg-accent/10 text-accent',
};

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 01-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.12.17 1.73 2.65 4.2 3.71.59.25 1.04.4 1.4.52.59.18 1.12.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}

// Two rows on phones keeps the live check-in feed above the fold; desktop has
// the vertical room for three.
const MOBILE_LIMIT = 2;
const DESKTOP_LIMIT = 3;

/**
 * Live public-website enquiry funnel for the front desk.
 *
 * Leads arrive from the public site with no staff visibility until now. Rows
 * are supplied pre-scoped by the server component, so no client query can widen
 * the tenant boundary.
 */
export function LeadsWidget({ gymName, leads }: { gymName: string; leads: DeskLead[] }) {
  const [showAll, setShowAll] = useState(false);

  // Zero pending enquiries collapses to a single pill rather than an empty card.
  if (!leads.length) {
    return (
      <p className="mt-6" data-testid="leads-empty-pill">
        <span className="inline-flex items-center rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
          ✓ 0 pending enquiries
        </span>
      </p>
    );
  }

  const visible = showAll ? leads : leads.slice(0, DESKTOP_LIMIT);

  return (
    <section
      className="mt-6 overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/60"
      aria-labelledby="leads-heading"
      data-testid="leads-widget"
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 id="leads-heading" className="text-sm font-bold text-white">
            🔥 New Enquiries &amp; Free Trials
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {leads.length} pending from the public website
          </p>
        </div>
        <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
          {leads.length}
        </span>
      </div>

      <ul className="divide-y divide-zinc-800">
        {visible.map((lead, index) => {
          const waNumber = toWhatsAppNumber(lead.phoneNumber);
          const message =
            `Hi ${lead.fullName}! Welcome to ${gymName}. Your 1-Day Trial workout pass ` +
            'is confirmed for today. See you at the desk!';
          const waUrl = waNumber
            ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`
            : null;

          const onboardUrl =
            `/dashboard/members/new?name=${encodeURIComponent(lead.fullName)}` +
            `&phone=${encodeURIComponent(lead.phoneNumber)}`;

          return (
            <li
              key={lead.id}
              data-testid="lead-row"
              className={`p-3.5 ${!showAll && index >= MOBILE_LIMIT ? 'hidden sm:block' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-100">{lead.fullName}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{lead.phoneNumber}</p>
                </div>
                <span className="shrink-0 text-[11px] text-slate-500">
                  {relativeTime(lead.createdAt)}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    SOURCE_STYLE[lead.source] ?? 'bg-zinc-800 text-slate-300'
                  }`}
                >
                  {lead.source}
                </span>
                {lead.request ? (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                    {lead.request}
                  </span>
                ) : null}
                {lead.goal ? (
                  <span className="text-[11px] text-slate-500">{lead.goal}</span>
                ) : null}
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="lead-whatsapp"
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-2 text-xs font-bold text-success transition active:scale-[0.98]"
                  >
                    <WhatsAppGlyph />
                    Demo Pass
                  </a>
                ) : (
                  <span className="flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-800 text-xs text-slate-600">
                    No phone
                  </span>
                )}
                <Link
                  href={onboardUrl}
                  data-testid="lead-onboard"
                  className="flex min-h-[44px] items-center justify-center rounded-lg border border-accent/40 bg-accent/15 px-2 text-xs font-bold text-accent transition active:scale-[0.98]"
                >
                  👤 Onboard
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {leads.length > MOBILE_LIMIT ? (
        <button
          type="button"
          onClick={() => setShowAll((open) => !open)}
          data-testid="leads-toggle"
          className={`min-h-[44px] w-full items-center justify-center border-t border-zinc-800 text-xs font-bold text-accent transition active:scale-[0.98] ${
            leads.length > DESKTOP_LIMIT ? 'flex' : 'flex sm:hidden'
          }`}
        >
          {showAll ? (
            'Show less ↑'
          ) : (
            <>
              <span className="sm:hidden">
                +{leads.length - MOBILE_LIMIT} more enquir
                {leads.length - MOBILE_LIMIT === 1 ? 'y' : 'ies'} ↓
              </span>
              <span className="hidden sm:inline">View All Enquiries ({leads.length}) ↓</span>
            </>
          )}
        </button>
      ) : null}
    </section>
  );
}
