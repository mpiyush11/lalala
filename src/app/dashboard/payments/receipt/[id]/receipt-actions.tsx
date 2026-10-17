'use client';

import { useState } from 'react';

export function ReceiptActions({
  amount,
  memberName,
  paymentId,
  receiptNo,
  securityCode,
}: {
  amount: string;
  memberName: string;
  paymentId: string;
  receiptNo: string;
  securityCode: string;
}) {
  const [copied, setCopied] = useState(false);

  function verificationUrl(): string {
    return `${window.location.origin}/verify-receipt/${paymentId}`;
  }

  async function copyLink() {
    await navigator.clipboard.writeText(verificationUrl());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    const text = [
      `Payment receipt ${receiptNo}`,
      `Member: ${memberName}`,
      `Amount: ${amount}`,
      `Security: ${securityCode}`,
      `Verify: ${verificationUrl()}`,
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 print:hidden">
      <button type="button" onClick={shareWhatsApp} className="h-11 rounded-xl bg-success px-4 text-sm font-bold text-slate-950">Share on WhatsApp</button>
      <button type="button" onClick={copyLink} className="h-11 rounded-xl border border-accent/40 bg-accent/10 px-4 text-sm font-semibold text-accent">{copied ? 'Copied!' : 'Copy Receipt Link'}</button>
    </div>
  );
}
