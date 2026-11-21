/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base works for both user and project GitHub Pages URLs.
  base: './',
  test: {
    environment: 'jsdom',
  },
});
