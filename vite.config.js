import { defineConfig } from 'vite';

export default defineConfig({
  // Set base to the repository name for GitHub Pages deployment.
  // Change this to match your actual GitHub repository name.
  base: '/go-with-river-and-mountain/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
