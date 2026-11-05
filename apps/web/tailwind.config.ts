import type { Config } from 'tailwindcss';

/** Colours are CSS variables (see globals.css) so the same classes work in the dark and light themes. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // "white" is the foreground colour: white on the dark theme, ink on the light one, so
        // overlays like bg-white/10 and text-white keep working in both.
        white: v('fg'),
        ink: v('ink'),
        t1: v('t1'),
        t2: v('t2'),
        t3: v('t3'),
        violet: v('violet'),
        brand: '#6D4DF2',
        pink: v('pink'),
        ok: v('ok'),
        warn: v('warn'),
        risk: v('risk'),
        info: v('info'),
      },
      fontFamily: {
        sans: ['Onest', 'system-ui', 'sans-serif'],
        script: ['"Courier Prime"', '"Courier New"', 'monospace'],
        urdu: ['"Noto Nastaliq Urdu"', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
