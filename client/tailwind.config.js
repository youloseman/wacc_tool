/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Clariva palette
        forest: '#1C3A2F',
        forestDark: '#142B22',
        sage: '#2D6A4F',
        sageMid: '#3D7A5F',
        cream: '#FAF7F2',
        creamDeep: '#F0EBE1',
        gold: '#C9A84C',
        goldLight: '#DEC070',
        goldPale: '#F5EDD5',
        stone: '#6B6459',
        stonePale: '#A09890',
        ink: '#1C1915',

        // Legacy aliases mapped into new palette so existing classNames keep working.
        navy: '#1C3A2F',
        surface: '#FAF7F2',
        purple: {
          light: '#F5EDD5',
          DEFAULT: '#F0EBE1',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '14px',
        pill: '999px',
      },
      boxShadow: {
        gold: '0 4px 16px rgba(201,168,76,0.35)',
        goldLg: '0 6px 24px rgba(201,168,76,0.45)',
      },
    },
  },
  plugins: [],
};
