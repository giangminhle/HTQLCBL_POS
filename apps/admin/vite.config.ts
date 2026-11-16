/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { apiOriginOf, buildCsp } from '../../packages/shared/src/csp';

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
    plugins: [react()],
    resolve: {
      // Consume the shared package from source so Vite handles TS/ESM directly (no prebuild needed).
      alias: {
        '@retailchain/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      },
    },
    server: { port: 5173, host: true },
    preview: { port: 5173, headers: securityHeaders },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
