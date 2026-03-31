import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
        },
        accent: {
          saffron: 'var(--accent-saffron)',
          saffronDim: 'var(--accent-saffron-dim)',
          green: 'var(--accent-green)',
          red: 'var(--accent-red)',
          blue: 'var(--accent-blue)',
          purple: 'var(--accent-purple)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        border: {
          DEFAULT: 'var(--border)',
          bright: 'var(--border-bright)',
        },
      },
      boxShadow: {
        saffronGlow: '0 0 24px rgba(245, 158, 11, 0.32)',
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        monoData: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

