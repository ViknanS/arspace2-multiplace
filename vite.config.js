import { defineConfig } from 'vite';

// Base path for built asset URLs.
// - GitHub Pages serves the site from https://viknans.github.io/arspace/, so the
//   deploy workflow builds with BASE_PATH=/arspace/.
// - Everywhere else (npm run dev, Netlify, Vercel, opening dist/ locally) the
//   default './' keeps every asset path relative, which works at any location.
// The app uses hash routes (#/smartfit, #/product/chair), so refreshing or
// opening a deep link never needs server-side rewrites.
const base = process.env.BASE_PATH || './';

export default defineConfig({
  base,
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500, // model-viewer + three.js is one ~1 MB chunk by design
  },
  server: {
    host: true,
  },
});
