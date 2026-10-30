/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      manifest: {
        name: 'StatElite',
        short_name: 'StatElite',
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#f6f7f9',
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'docs/*.test.ts'],
  },
});
