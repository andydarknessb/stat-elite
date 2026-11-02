/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // a deploy takes over an installed app without waiting for every window to close
      registerType: 'autoUpdate',
      // the Barlow files are precached, so the type works with no signal like the rest of the app
      workbox: { globPatterns: ['**/*.{js,css,html,woff2}'] },
      manifest: {
        name: 'StatElite',
        short_name: 'StatElite',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0B1020',
        theme_color: '#0B1020',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'docs/*.test.ts'],
  },
});
