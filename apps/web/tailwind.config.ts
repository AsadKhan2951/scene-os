import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#070912',
        t1: '#F5F4FB',
        t2: '#C6C4DA',
        t3: '#A5A3BE',
        violet: '#C4B5FD',
        brand: '#6D4DF2',
        pink: '#F9A8D4',
        ok: '#34D399',
        warn: '#FBBF24',
        risk: '#FCA5A5',
        info: '#7DD3FC',
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
