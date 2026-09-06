/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#09090b", // Deep Charcoal/Black
        surface: "#18181b", // Slightly lighter zinc card
        border: "#27272a", // Zinc-800 border
        accent: {
          blue: "#3b82f6",
          cyan: "#06b6d4",
          purple: "#a855f7",
          green: "#10b981",
          amber: "#f59e0b",
          rose: "#f43f5e"
        }
      },
      fontFamily: {
        sans: ["Outfit", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"]
      }
    },
  },
  plugins: [],
}
