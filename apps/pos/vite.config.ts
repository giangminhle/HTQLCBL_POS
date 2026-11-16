/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { apiOriginOf, buildCsp } from '../../packages/shared/src/csp';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const apiUrl = loadEnv(mode, process.cwd(), '').VITE_API_URL ?? 'http://localhost:3000';
  // ADR-001: `vite preview` (production build) is served with the same CSP as nginx. `vite dev` is not (HMR).
  const securityHeaders = {
    'Content-Security-Policy': buildCsp(apiOriginOf(apiUrl)),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'RetailChain POS',
          short_name: 'POS',
          description: 'Bán hàng tại quầy – hoạt động cả khi mất mạng',
          lang: 'vi',
          start_url: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#0f172a',
          icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
        },
        workbox: {
          // App shell is precached so the POS opens without network. API calls are NOT cached here:
          // offline data lives in IndexedDB (Dexie) and is synced through the outbox (Sprint POS-05).
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: '/index.html',
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        '@retailchain/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      },
    },
    server: { port: 5174, host: true },
    preview: { port: 5174, headers: securityHeaders },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
