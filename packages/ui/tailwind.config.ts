import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-secondary': 'var(--color-surface-secondary)',
        'surface-hover': 'var(--color-surface-hover)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-tertiary': 'var(--color-text-tertiary)',
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
        },
        'bar-bg': 'var(--color-bar-bg)',
        'bar-text': 'var(--color-bar-text)',
        'bar-text-active': 'var(--color-bar-text-active)',
        'bar-active-bg': 'var(--color-bar-active-bg)',
        'strip-bg': 'var(--color-strip-bg)',
        'strip-text': 'var(--color-strip-text)',
        'strip-text-active': 'var(--color-strip-text-active)',
        'strip-active-bg': 'var(--color-strip-active-bg)',
        'strip-border': 'var(--color-strip-border)',
        'btn-primary-text': 'var(--color-btn-primary-text)',
        success: {
          fill: 'var(--color-success-fill)',
          text: 'var(--color-success-text)',
        },
        warning: {
          fill: 'var(--color-warning-fill)',
          text: 'var(--color-warning-text)',
          dot: 'var(--color-warning-dot, #fbbf24)',
        },
        danger: {
          fill: 'var(--color-danger-fill)',
          text: 'var(--color-danger-text)',
          dot: 'var(--color-danger-dot)',
        },
        info: {
          fill: 'var(--color-info-fill)',
          text: 'var(--color-info-text)',
          dot: 'var(--color-info-dot, #60a5fa)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        pill: '9999px',
      },
      spacing: {
        '4.5': '18px',
      },
      maxWidth: {
        content: '1280px',
        form: '720px',
      },
    },
  },
  plugins: [],
};

export default config;
