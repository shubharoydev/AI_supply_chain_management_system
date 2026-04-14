/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        status: {
          normal: '#10b981',   // green
          risk:   '#f59e0b',   // yellow
          delay:  '#ef4444',   // red
        }
      }
    },
  },
  plugins: [],
}