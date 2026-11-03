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
      // -------------------------------------------------------------------
      // Type. Inter carries interface copy; JetBrains Mono carries every
      // number — currency, counts, KPI figures, member codes, timestamps —
      // so columns of digits align and a ₹ amount reads as data, not prose.
      // Both are loaded in globals.css; the stacks below keep sane fallbacks
      // if the font never arrives.
      // -------------------------------------------------------------------
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        canvas: '#09090B',
        surface: {
          DEFAULT: '#111113',
          elevated: '#141417',
        },
        accent: {
          DEFAULT: '#7C3AED',
          purple: '#7C3AED',
        },
        success: {
          DEFAULT: '#10B981',
          emerald: '#10B981',
        },
        danger: {
          DEFAULT: '#F43F5E',
          rose: '#F43F5E',
        },
        border: '#262626',
        // -------------------------------------------------------------------
        // Semantic surface/type tokens, mapped onto the Carbon-Black ramp.
        //
        // Zero blue-channel bias: every neutral below is R=G=B or within one
        // point of it. The previous ramp (#121212 / #1E1E2E / #27273A) carried
        // a navy cast because the blue channel ran 4-8 points hot.
        // -------------------------------------------------------------------
        foreground: '#FAFAFA',
        muted: {
          DEFAULT: '#141417',
          foreground: '#A3A3A3',
        },
        card: {
          DEFAULT: '#111113',
          foreground: '#FAFAFA',
        },
        primary: {
          DEFAULT: '#7C3AED',
          foreground: '#FFFFFF',
        },
        ring: '#7C3AED',
        // -------------------------------------------------------------------
        // `zinc` is the app's only neutral ramp, so it is redefined end to end
        // rather than allowed to fall through to Tailwind's default.
        //
        // Tailwind's stock zinc is a COOL grey: the blue channel runs 4-9 points
        // hot at every step (#A1A1AA, #71717A, #52525B, #D4D4D8). Against a
        // genuinely neutral carbon surface that cast is visible as a blue haze,
        // which is why the surfaces were fixed but the UI still read muddy.
        //
        // Every step below is R=G=B. The four darkest are the surface roles and
        // stay on the specified carbon tokens; at #09/#11/#14 a two-point blue
        // delta is below the perceptual floor, whereas the text steps had a
        // nine-point delta that was plainly visible.
        //
        //   950 #09090B  page canvas      400 #A3A3A3  secondary text
        //   900 #111113  card / panel     300 #D4D4D4  muted heading
        //   800 #141417  control fill     200 #E5E5E5  divider (light)
        //   700 #262626  hairline         100 #F5F5F5  subtle fill
        //   600 #525252  placeholder       50 #FAFAFA  inverted surface
        //   500 #737373  tertiary text
        // -------------------------------------------------------------------
        zinc: {
          '50': '#FAFAFA',
          '100': '#F5F5F5',
          '200': '#E5E5E5',
          '300': '#D4D4D4',
          '400': '#A3A3A3',
          '500': '#737373',
          '600': '#525252',
          '700': '#262626',
          '800': '#141417',
          '900': '#111113',
          '950': '#09090B',
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
        // 'cyan-glow' survives only for /login, which is out of the carbon
        // re-theme. Everything else uses the brand purple.
        'cyan-glow': '0 0 24px rgb(34 211 238 / 0.18)',
        // Premium depth tokens. `glow` is the soft halo behind an active or
        // primary element; `glow-strong` is reserved for the brand mark.
        glow: '0 0 20px rgb(124 92 246 / 0.2)',
        'glow-strong': '0 0 15px rgb(124 92 246 / 0.5)',
        'purple-glow': '0 0 24px rgb(124 58 237 / 0.22)',
        card: '0 1px 2px rgb(0 0 0 / 0.32), 0 8px 24px rgb(0 0 0 / 0.26)',
        'card-lift':
          '0 2px 4px rgb(0 0 0 / 0.38), 0 14px 34px rgb(0 0 0 / 0.32)',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
