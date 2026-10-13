/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        axim: {
          slate: '#0B0F19',
          surface: '#111827',
          border: '#1F2937',
          yellow: '#FDD023',
        }
      },

      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        }
      },
      animation: {
        shimmer: 'shimmer 2s infinite',
      }
    }
  },
  plugins: [require('@tailwindcss/typography')],
}