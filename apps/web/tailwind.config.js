/** @type {import('tailwindcss').Config} */
/** Design tokens from DESIGN_FILE_V2.html: primary/accent, background, text, radius, shadows, Inter. */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        'primary-dark': '#2563eb',
        'primary-hover': '#2563eb',
        accent: '#90CAF9',
        'background-light': '#f8fafc',
        'surface': '#ffffff',
        'soft-blue': '#F0F5FA',
        'surface-tint': '#F0F7FF',
        'text-main': '#0f172a',
        'text-dark': '#1e293b',
        'text-secondary': '#64748b',
        'text-muted': '#94a3b8',
        'input-border': '#e2e8f0',
        'blue-tint': '#f0f9ff',
        'icon-grey': '#475569',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
      boxShadow: {
        soft: '0 10px 40px -10px rgba(0, 0, 0, 0.05)',
        card: '0 2px 8px rgba(0,0,0,0.04)',
        elevated: '0 20px 40px -12px rgba(148, 163, 184, 0.2)',
        floating: '0 20px 40px -8px rgba(59, 130, 246, 0.15)',
        nav: '0 -4px 20px rgba(0,0,0,0.03)',
        subtle: '0 2px 10px rgba(0, 0, 0, 0.03)',
      },
    },
  },
  plugins: [],
};
