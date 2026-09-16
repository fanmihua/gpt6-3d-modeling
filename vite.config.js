import { defineConfig } from 'vite';

// Relative asset URLs keep all three pages portable under a Pages repository path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: { course: 'index.html', demo: 'demo.html', template: 'template/index.html' },
    },
  },
});
