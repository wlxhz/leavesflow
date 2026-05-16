import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#fffaf3',
        ink: '#34423a',
        leaf: '#7eaf8f',
        mint: '#dcefe1',
        peach: '#f5b8a6',
        butter: '#f6dea0',
        line: '#eadfce',
      },
      boxShadow: {
        paper: '0 18px 50px rgba(96, 77, 55, 0.10)',
        soft: '0 10px 30px rgba(96, 77, 55, 0.08)',
      },
      fontFamily: {
        sans: ['"Nunito"', '"Noto Sans SC"', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
} satisfies Config
