/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Primary — deep teal-slate
        brand: {
          50:  '#edfafa',
          100: '#d5f5f6',
          200: '#a8ecee',
          300: '#6ddde2',
          400: '#2ec8cf',
          500: '#14adb5',
          600: '#0d8a96',
          700: '#0f6e7a',
          800: '#125863',
          900: '#134a53',
          950: '#062f36',
        },
        // Accent — warm amber
        accent: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        // Text tokens — maps CSS vars to Tailwind utilities
        // Enables: text-text-primary, text-text-secondary, text-text-muted
        // and placeholder-text-muted in @apply directives
        text: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
        },
        // Surface — dark slate for admin portals
        surface: {
          900: '#0a0f14',
          800: '#0f1923',
          700: '#162030',
          600: '#1e2d3e',
          500: '#263548',
          400: '#304154',
          300: '#3d5068',
        },
      },
      boxShadow: {
        card: '0 2px 16px rgba(0,0,0,0.18)',
        glow: '0 0 24px rgba(20,173,181,0.25)',
      },
      animation: {
        'fade-up': 'fadeUp 0.4s ease forwards',
        'fade-in': 'fadeIn 0.3s ease forwards',
        'slide-in': 'slideIn 0.35s ease forwards',
        'pulse-slow': 'pulse 3s ease infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
