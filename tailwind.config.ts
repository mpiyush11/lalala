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
      },
      boxShadow: {
        'cyan-glow': '0 0 24px rgb(34 211 238 / 0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
