/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '#1450f5',
          dark:      '#141414',
          cream:     '#f3eee6',
          yellow:    '#ffe141',
          lightblue: '#d2f5ff',
          pink:      '#ffcdd7',
          mint:      '#aae1c8',
          white:     '#ffffff',
        },
      },
    },
  },
  plugins: [],
}
