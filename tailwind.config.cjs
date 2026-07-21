/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0e1117',
        surface: '#161b22',
        card: '#1c2129',
        border: '#30363d',
        accent: '#58a6ff',
      }
    },
  },
  plugins: [],
}
