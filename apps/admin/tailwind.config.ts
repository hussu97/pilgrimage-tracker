import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#B0563D",
        "primary-dark": "#8E4433",
        "primary-hover": "#8E4433",
        accent: "#D4A08C",
        "background-light": "#F5F0E9",
        surface: "#ffffff",
        "soft-blue": "#F2E8E4",
        "surface-tint": "#EADEC8",
        "text-main": "#2D3E3B",
        "text-dark": "#2D3E3B",
        "text-secondary": "#6B7280",
        "text-muted": "#A39C94",
        "input-border": "#D1C7BD",
        "blue-tint": "#FAF6F0",
        "icon-grey": "#4A5D59",
        "dark-bg": "#1A1A1A",
        "dark-surface": "#242424",
        "dark-border": "#333333",
        "dark-text-secondary": "#A39C94",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
        full: "9999px",
      },
      boxShadow: {
        soft: "0 10px 40px -10px rgba(0, 0, 0, 0.05)",
        card: "0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
        "card-md": "0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
        elevated: "0 20px 40px -12px rgba(148, 163, 184, 0.2)",
        floating: "0 20px 40px -8px rgba(176, 86, 61, 0.20)",
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
        nav: "0 -4px 20px rgba(0,0,0,0.03)",
        subtle: "0 2px 10px rgba(0, 0, 0, 0.03)",
      },
    },
  },
  plugins: [],
};

export default config;
