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
      <button type="button" onClick={shareWhatsApp} className="h-11 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white">Share on WhatsApp</button>
      <button type="button" onClick={copyLink} className="h-11 rounded-xl border border-[#7C3AED]/40 bg-[#7C3AED]/10 px-4 text-sm font-semibold text-[#8B5CF6]">{copied ? 'Copied!' : 'Copy Receipt Link'}</button>
    </div>
  );
}
