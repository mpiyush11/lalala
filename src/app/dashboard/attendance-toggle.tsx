'use client';

import { useState } from 'react';
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

    const supabase = createClient();
    const { error } = await supabase
      .from('tenants')
      .update({ is_attendance_enabled: nextValue })
      .eq('tenant_id', tenantId);

    if (error) {
      setErrorMessage('Unable to update attendance setting.');
      setIsSaving(false);
      return;
    }

    setIsEnabled(nextValue);
    setIsSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {errorMessage ? <span role="alert" className="text-xs text-red-300">{errorMessage}</span> : null}
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
