import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Toaster } from 'sonner';

import './globals.css';

/**
 * Self-hosted variable fonts.
 *
 * These are committed to `src/app/fonts/` and served from `/_next/static/`, so
 * a typeface can never be at the mercy of a network request. The previous
 * approach — a CSS `@import` from fonts.googleapis.com — fails *silently*:
 * if the request is blocked (CSP, offline, sandboxed preview) the browser just
 * sits on the system fallback forever and the UI quietly looks cheap, with no
 * build error and no console signal.
 *
 * `next/font/local` inverts that: a missing or corrupt file fails the build
 * loudly, the font is preloaded, and Next emits metric-adjusted `@font-face`
 * fallbacks so the swap does not shift layout.
 *
 * Both files are variable (weight axis 100-800), so one file per family covers
 * every weight the UI uses.
 */
const inter = localFont({
  src: './fonts/inter-latin-wght-normal.woff2',
  variable: '--font-sans',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
  preload: true,
  // No metric-override fallback. next/font would otherwise emit
  // `__…_Fallback { src: local("Arial"); size-adjust: 131.49% }`, and every
  // glyph missing from the latin subset — notably ₹ (U+20B9) — would render as
  // Arial scaled 31% larger than the surrounding digits.
  adjustFontFallback: false,
});

const jetbrainsMono = localFont({
  // Two sources so the rupee is drawn by JetBrains Mono, not by a system
  // fallback. Google Fonts' `latin` subset stops at U+20AC (€) and does NOT
  // carry U+20B9 (₹), which is why the rupee previously rendered in a
  // different typeface beside the digits. `latin-ext` covers U+20AD-20C0.
  src: [
    { path: './fonts/jetbrains-mono-latin-wght-normal.woff2', weight: '100 800', style: 'normal' },
    {
      path: './fonts/jetbrains-mono-latin-ext-wght-normal.woff2',
      weight: '100 800',
      style: 'normal',
      unicodeRange: 'U+20B9',
    },
  ],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
  preload: true,
  adjustFontFallback: false,
});

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
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#09090B] font-sans text-zinc-100 antialiased">
        {children}
        {/* Single global toast host. Every mutation reports through it, so an
            operator sees the same confirmation or failure wherever they are.
            `richColors` gives the green/red variants without per-call styling. */}
        <Toaster
          closeButton
          duration={4000}
          position="top-center"
          richColors
          theme="dark"
          toastOptions={{ className: 'font-medium' }}
        />
      </body>
    </html>
  );
}
