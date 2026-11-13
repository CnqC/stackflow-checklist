import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;
const releaseNotes = JSON.parse(readFileSync(new URL('./release-notes.json', import.meta.url), 'utf8')) as { title: string; changes: string[] };
const buildId = process.env.GITHUB_SHA?.slice(0, 12) ?? execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    {
      name: 'stackflow-version-manifest',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({
          version: packageVersion, buildId, ...releaseNotes,
        }) });
      },
    },
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
