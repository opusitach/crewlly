import type { Config } from "tailwindcss"

// Standalone Tailwind config for the admin app. Deliberately NOT extending the
// main app's design tokens — admin should look distinctly different from owner UI
// to avoid confusion.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
