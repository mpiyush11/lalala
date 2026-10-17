import type { Config } from 'tailwindcss';

const config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#121212',
        surface: {
          DEFAULT: '#1E1E2E',
          elevated: '#27273A',
        },
        accent: {
          DEFAULT: '#22D3EE',
          cyan: '#22D3EE',
        },
        success: {
          DEFAULT: '#10B981',
          emerald: '#10B981',
        },
        danger: {
          DEFAULT: '#EF4444',
          crimson: '#EF4444',
        },
        border: '#3C494C',
        // -------------------------------------------------------------------
        // Semantic surface/type tokens.
        //
        // The palette above is the *raw* scale. These are the roles, so a
        // component can say "muted foreground" instead of re-deciding which
        // grey means "secondary" every time. They map onto the same hexes that
        // globals.css already exposes as custom properties.
        // -------------------------------------------------------------------
        foreground: '#F8FAFC',
        muted: {
          DEFAULT: '#1E1E2E',
          foreground: '#94A3B8',
        },
        card: {
          DEFAULT: '#1E1E2E',
          foreground: '#F8FAFC',
        },
        primary: {
          DEFAULT: '#22D3EE',
          foreground: '#121212',
        },
        ring: '#22D3EE',
        // -------------------------------------------------------------------
        // Semantic aliasing. `zinc` is the LEGACY ramp: every screen written
        // before the ROADMAP tokens landed reaches for it directly. Rather than
        // rewriting ~380 call sites one file at a time, the four shades that
        // are actually in use are remapped onto the canonical palette, so a
        // single edit re-themes the whole app.
        //
        //   zinc-950 -> #0E0F14  card fill
        //   zinc-900 -> #1E1E2E  surface
        //   zinc-800 -> #27273A  surface-elevated
        //   zinc-700 -> #3C494C  border
        //
        // zinc-950 is deliberately NOT #121212 (canvas). 47 call sites use
        // `bg-zinc-950/60` as a translucent CARD fill over a #121212 shell;
        // pointing the shade at the shell colour would blend every one of those
        // cards into the page and leave only their borders floating. It stays a
        // step DARKER than canvas, re-tinted slate so nothing reads as neutral
        // black. Shades 50-600 are untouched and keep their Tailwind defaults.
        // -------------------------------------------------------------------
        zinc: {
          '950': '#0E0F14',
          '900': '#1E1E2E',
          '800': '#27273A',
          '700': '#3C494C',
        },
      },
      // Radius scale, named by role so it reads as intent rather than a number.
      //   card    1rem     — top-level surfaces
      //   panel   0.75rem  — inputs and nested panels (one step inside a card)
      //   control 0.5rem   — buttons and interactive controls
      //   pill    9999px   — badges, chips, status
      borderRadius: {
        card: '1rem',
        panel: '0.75rem',
        control: '0.5rem',
        pill: '9999px',
      },
      boxShadow: {
        'cyan-glow': '0 0 24px rgb(34 211 238 / 0.18)',
        card: '0 1px 2px rgb(0 0 0 / 0.32), 0 8px 24px rgb(0 0 0 / 0.26)',
        'card-lift':
          '0 2px 4px rgb(0 0 0 / 0.38), 0 14px 34px rgb(0 0 0 / 0.32)',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
