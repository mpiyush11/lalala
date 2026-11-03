'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

export function AttendanceToggle({
  enabled,
  tenantId,
}: {
  enabled: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function toggleAttendance() {
    const nextValue = !isEnabled;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tenants')
        .update({ is_attendance_enabled: nextValue })
        .eq('tenant_id', tenantId);

      if (error) {
        setErrorMessage('Unable to update attendance setting.');
        toast.error('Unable to update attendance setting.');
        return;
      }

      setIsEnabled(nextValue);
      toast.success(nextValue ? 'Attendance enabled.' : 'Attendance disabled.');
      router.refresh();
    } catch {
      setErrorMessage('Could not reach the server. Please try again.');
      toast.error('Could not reach the server. Please try again.');
    } finally {
      // Unlocks on success AND on failure. Without this, a rejected fetch
      // (offline, DNS, aborted request) would leave the switch disabled with no
      // way to retry — the worst possible failure mode for a counter operator.
      setIsSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {errorMessage ? <span role="alert" className="text-xs text-rose-400">{errorMessage}</span> : null}
      <span className="text-xs text-zinc-500">Attendance</span>
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        disabled={isSaving}
        onClick={toggleAttendance}
        className={`relative h-7 w-12 rounded-full border transition focus:outline-none focus:ring-4 focus:ring-[#7C3AED]/20 disabled:opacity-60 ${isEnabled ? 'border-emerald-500/40 bg-emerald-500/25' : 'border-white/[0.08] bg-white/[0.05]'}`}
      >
        <span className={`absolute top-1 h-[18px] w-[18px] rounded-full transition ${isEnabled ? 'left-6 bg-emerald-400' : 'left-1 bg-zinc-500'}`} />
        <span className="sr-only">{isSaving ? 'Saving attendance setting' : 'Toggle attendance module'}</span>
      </button>
      <span className={`text-xs font-semibold ${isEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
        {isSaving ? 'Saving…' : isEnabled ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}
