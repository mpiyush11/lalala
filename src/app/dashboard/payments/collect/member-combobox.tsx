'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type CollectMember = {
  duesMinor: number;
  expiresOn: string;
  fullName: string;
  id: string;
  isLapsed: boolean;
  memberCode: string;
  phoneNumber: string;
};

/**
 * Searchable member picker replacing the native <select>.
 *
 * A gym with thousands of members makes a dropdown unusable; this filters by
 * name, phone, or member code with keyboard navigation. The list is supplied
 * pre-scoped by the server component, so it cannot reach another tenant.
 */
export function MemberCombobox({
  members,
  onSelect,
  selected,
}: {
  members: CollectMember[];
  onSelect: (member: CollectMember | null) => void;
  selected: CollectMember | null;
}) {
  const [term, setTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const query = term.trim().toLocaleLowerCase();
    if (!query) return members.slice(0, 8);

    return members
      .filter((member) =>
        `${member.fullName} ${member.memberCode} ${member.phoneNumber}`
          .toLocaleLowerCase()
          .includes(query),
      )
      .slice(0, 8);
  }, [members, term]);

  useEffect(() => {
    setActiveIndex(0);
  }, [term]);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
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

  function choose(member: CollectMember) {
    onSelect(member);
    setTerm('');
    setIsOpen(false);
  }

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-bold text-accent">
          {selected.fullName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{selected.fullName}</p>
          <p className="truncate text-xs text-slate-500">
            {selected.memberCode} · {selected.phoneNumber}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setTerm('');
          }}
          className="min-h-[44px] shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-xs font-semibold text-slate-300 transition hover:border-accent/40 hover:text-accent active:scale-[0.98]"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        id="member-combobox"
        type="search"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="member-combobox-list"
        aria-autocomplete="list"
        autoComplete="off"
        value={term}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setTerm(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && isOpen && results[activeIndex]) {
            event.preventDefault();
            choose(results[activeIndex]);
          } else if (event.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        placeholder="Search member or phone..."
        className="h-12 min-h-[44px] w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 pl-4 pr-12 text-base text-white outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 sm:border-zinc-800"
      />

      {isOpen ? (
        <ul
          id="member-combobox-list"
          role="listbox"
          className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-border/70 bg-surface-elevated shadow-2xl shadow-black/40"
        >
          {results.length ? (
            results.map((member, index) => (
              <li key={member.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(member)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                    index === activeIndex ? 'bg-accent/10' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{member.fullName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {member.memberCode} · {member.phoneNumber}
                    </p>
                  </div>
                  {member.duesMinor > 0 ? (
                    <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-red-200">
                      DUE
                    </span>
                  ) : null}
                  {member.isLapsed ? (
                    <span className="shrink-0 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      LAPSED
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No member matches.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
