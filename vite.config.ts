import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      workbox: {
        importScripts: ['notification-click.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,wav}'],
      },
      manifest: {
        name: 'StackFlow — Checklist Dự Án Nhóm',
        short_name: 'StackFlow',
        description: 'Checklist theo Stack đồng bộ thời gian thực cho nhóm dưới 10 người trên Web & Mobile App',
        theme_color: '#0f172a',
        background_color: '#090d16',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
