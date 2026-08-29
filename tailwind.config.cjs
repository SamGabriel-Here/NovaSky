/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep-space palette. Contrast ratios against `space-900` are checked in
        // docs/DESIGN.md; body text sits at >= 7:1, secondary text at >= 4.5:1.
        space: {
          950: '#04060f',
          900: '#080c1a',
          850: '#0d1324',
          800: '#131a30',
          700: '#1d2745',
          600: '#2a375c',
          500: '#3d4d78'
        },
        nova: {
          300: '#a5c8ff',
          400: '#7aa9ff',
          500: '#4d86ff',
          600: '#2f66e0'
        },
        star: { warm: '#ffd9a0', cool: '#cfe3ff' }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      transitionTimingFunction: { smooth: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    }
  },
  plugins: []
}
