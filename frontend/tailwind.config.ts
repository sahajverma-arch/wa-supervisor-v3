import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './services/**/*.{ts,tsx}', './socket/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f5f7f4',
          100: '#e7eee5',
          200: '#c8d8c2',
          300: '#a6bf9d',
          400: '#7e9f76',
          500: '#55704f',
          600: '#3f5540',
          700: '#304035',
          800: '#202c25',
          900: '#111813'
        }
      },
      boxShadow: {
        soft: '0 20px 60px rgba(10, 20, 10, 0.18)'
      }
    }
  },
  plugins: []
};

export default config;
