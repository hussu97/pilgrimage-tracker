import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#007AFF",
        "primary-dark": "#0062CC",
        "primary-hover": "#0062CC",
        accent: "#90CAF9",
        "background-light": "#f8fafc",
        surface: "#ffffff",
        "soft-blue": "#EBF5FF",
        "surface-tint": "#EBF5FF",
        "text-main": "#0f172a",
        "text-dark": "#1e293b",
        "text-secondary": "#64748b",
        "text-muted": "#94a3b8",
        "input-border": "#e2e8f0",
        "blue-tint": "#f0f9ff",
        "icon-grey": "#475569",
        "dark-bg": "#121212",
        "dark-surface": "#1E1E1E",
        "dark-border": "#2C2C2E",
        "dark-text-secondary": "#A1A1A1",
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
        floating: "0 20px 40px -8px rgba(0, 122, 255, 0.20)",
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
        nav: "0 -4px 20px rgba(0,0,0,0.03)",
        subtle: "0 2px 10px rgba(0, 0, 0, 0.03)",
      },
    },
  },
  plugins: [],
};

export default config;
