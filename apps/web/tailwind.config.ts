import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm terracotta accent (Claude-like) on warm stone neutrals.
        brand: {
          50: "#fdf4f0",
          100: "#fbe6dc",
          200: "#f6c9b4",
          300: "#efa384",
          400: "#e57a52",
          500: "#c96442", // primary
          600: "#b14f31",
          700: "#933e29",
          800: "#773427",
          900: "#622e24",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
