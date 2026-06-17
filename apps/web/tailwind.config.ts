import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Palantir × Claude" dark theme (from the launch storyboard).
        // brand = the Claude clay accent: primary actions, links, identity.
        brand: {
          50: "#fbeee7",
          100: "#f5d5c5",
          200: "#edb095",
          300: "#e69d7b", // clay-lite (#e8a07c)
          400: "#df8a64",
          500: "#d97757", // clay — primary
          600: "#bd5d3e", // clay-deep — hover
          700: "#9c4a31",
          800: "#7c3b28",
          900: "#5e2f22",
        },
        // The neutral ramp is INTENTIONALLY INVERTED into a warm-dark scale:
        // the app was built light-first (low index = light surface, high index
        // = dark ink), so flipping the hex values turns every existing
        // bg-neutral-50/100, border-neutral-*, and text-neutral-* utility into
        // its dark-theme equivalent without rewriting hundreds of classes.
        // Low = darkest surface, high = cream ink.
        neutral: {
          50: "#262320", // base surface
          100: "#2e2a26", // raised surface / hover
          200: "#3c3833", // subtle line / pill
          300: "#4d4840", // border
          400: "#6f675b", // faint text / disabled
          500: "#978e81", // secondary text
          600: "#b3aa9c", // stronger secondary
          700: "#cbc0b3", // strong text
          800: "#e1dace", // near-heading
          900: "#f1ece4", // headings / primary ink (cream)
          950: "#1a1816", // deepest
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
