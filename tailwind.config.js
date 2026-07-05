/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./routes/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          // These reference CSS vars so both themes share the same Tailwind utilities.
          // When --ink-950 changes, bg-ink-950 changes everywhere automatically.
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          850: "rgb(var(--ink-850) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft:    "rgb(var(--accent-soft) / <alpha-value>)",
          glow:    "rgb(var(--accent-glow) / <alpha-value>)",
        },
        signal: {
          green: "#34d399",
          amber: "#fbbf24",
          red:   "#f87171",
          cyan:  "#22d3ee",
        },
      },
      boxShadow: {
        glow:    "0 0 0 1px rgba(var(--accent)/0.25), 0 8px 40px -12px rgba(var(--accent)/0.45)",
        "glow-lg":"0 0 0 1px rgba(var(--accent)/0.3), 0 20px 60px -15px rgba(var(--accent)/0.35)",
      },
      animation: {
        "fade-in":   "fade-in 0.4s ease both",
        "slide-up":  "slide-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-glow":"pulse-glow 3s ease-in-out infinite",
      },
      keyframes: {
        "fade-in":   { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up":  { from: { opacity: "0", transform: "translateY(20px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pulse-glow":{ "0%,100%": { opacity: "0.6" }, "50%": { opacity: "1" } },
      },
    },
  },
  plugins: [],
};
