/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Absolute base: routes are real paths (/disk-discovery/disco/<id>), so assets
  // must not resolve relative to a nested URL.
  base: '/disk-discovery/',
  test: {
    environment: 'jsdom',
  },
});
