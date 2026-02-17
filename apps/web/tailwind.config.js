/** @type {import('tailwindcss').Config} */
/** Design tokens from FRONTEND_REWAMP design files: primary/accent, background, text, radius, shadows, Inter. */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#007AFF',
        'primary-dark': '#0062CC',
        'primary-hover': '#0062CC',
        accent: '#90CAF9',
        'background-light': '#f8fafc',
        'surface': '#ffffff',
        'soft-blue': '#EBF5FF',
        'surface-tint': '#EBF5FF',
        'text-main': '#0f172a',
        'text-dark': '#1e293b',
        'text-secondary': '#64748b',
        'text-muted': '#94a3b8',
        'input-border': '#e2e8f0',
        'blue-tint': '#f0f9ff',
        'icon-grey': '#475569',
        'dark-bg': '#121212',
        'dark-surface': '#1E1E1E',
        'dark-border': '#2C2C2E',
        'dark-text-secondary': '#A1A1A1',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',   // 12px – inputs, inner elements
        '2xl': '1rem',   // 16px – cards (aligned with design reference)
        '3xl': '1.5rem', // 24px – large panels, bottom sheets
        '4xl': '2rem',   // 32px – hero sections
        full: '9999px',
      },
      boxShadow: {
        soft: '0 10px 40px -10px rgba(0, 0, 0, 0.05)',
        card: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        'card-md': '0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
        elevated: '0 20px 40px -12px rgba(148, 163, 184, 0.2)',
        floating: '0 20px 40px -8px rgba(0, 122, 255, 0.20)',
        glass: '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
        nav: '0 -4px 20px rgba(0,0,0,0.03)',
        subtle: '0 2px 10px rgba(0, 0, 0, 0.03)',
      },
      animation: {
        'shimmer': 'shimmer 1.5s infinite linear',
        'check-in': 'checkInSpring 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'heart-pop': 'heartPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'slide-up': 'slideUp 0.3s ease-out forwards',
        'fade-in': 'fadeIn 0.25s ease-out forwards',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        checkInSpring: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.3)' },
          '70%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        heartPop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.4)' },
          '100%': { transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
