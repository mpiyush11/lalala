import type { Metadata, Viewport } from 'next';

import './globals.css';

/**
 * `maximumScale: 5` keeps pinch-zoom available for accessibility while our
 * 16px minimum input font size prevents iOS/Android auto-zoom on focus.
 * `viewportFit: 'cover'` exposes env(safe-area-inset-*) for notched devices.
 */
export const viewport: Viewport = {
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#09090b',
  viewportFit: 'cover',
  width: 'device-width',
};

export const metadata: Metadata = {
  title: {
    default: 'GymOS',
    template: '%s | GymOS',
  },
  description: 'Secure gym operations for owners and reception teams.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
