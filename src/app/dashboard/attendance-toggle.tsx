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
      {errorMessage ? <span role="alert" className="text-xs text-danger">{errorMessage}</span> : null}
      <span className="text-xs text-slate-500">Attendance</span>
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        disabled={isSaving}
        onClick={toggleAttendance}
        className={`relative h-7 w-12 rounded-full border transition focus:outline-none focus:ring-4 focus:ring-accent/10 disabled:opacity-60 ${isEnabled ? 'border-success/40 bg-success/25' : 'border-border bg-surface-elevated'}`}
      >
        <span className={`absolute top-1 h-[18px] w-[18px] rounded-full transition ${isEnabled ? 'left-6 bg-success' : 'left-1 bg-slate-500'}`} />
        <span className="sr-only">{isSaving ? 'Saving attendance setting' : 'Toggle attendance module'}</span>
      </button>
      <span className={`text-xs font-semibold ${isEnabled ? 'text-success' : 'text-slate-500'}`}>
        {isSaving ? 'Saving…' : isEnabled ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}
