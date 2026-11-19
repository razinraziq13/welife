import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { aliases } from './aliases.ts';

const THEME_COLOR = '#0e6e5c';
const BACKGROUND_COLOR = '#f6f5f1';
/**
 * Where the app is served. '/' by default; the GitHub Pages build sets WELIFE_BASE=/welife/
 * because a project site lives under the repository name.
 */
const BASE = process.env.WELIFE_BASE ?? '/';

/**
 * Content Security Policy for production builds (docs/SECURITY.md). Everything is served from
 * the app's own origin; the only inline script (the pre-paint theme snippet in index.html) is
 * allowed by its hash. The dev server is left without a policy because Vite injects inline
 * scripts for hot reload.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'welife-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (m) =>
            `'sha256-${createHash('sha256')
              .update(m[1] ?? '')
              .digest('base64')}'`,
        );
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`,
          "style-src 'self'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          "connect-src 'self'",
          "worker-src 'self'",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'none'",
        ].join('; ');
        return html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
  };
}

export default defineConfig({
  base: BASE,
  resolve: { alias: aliases },
  worker: { format: 'es' },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: BASE,
        name: 'WeLife',
        short_name: 'WeLife',
        description: 'One Life. Endless Generations. An offline life simulator.',
        lang: 'en',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        categories: ['games', 'entertainment'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json,woff2}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        // Content packs will grow; keep generous but bounded.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
});
