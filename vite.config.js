import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // OWNER_EMAIL (Vercel variable) is made available to the app at build time. Only this one
  // non-secret address is exposed; SMTP_PASS and other server settings never reach the browser.
  const env = loadEnv(mode, process.cwd(), '');
  const ownerEmail = (env.OWNER_EMAIL || env.VITE_OWNER_EMAIL || '').trim().toLowerCase();
  // Public address of the app (for the "Copy App URL" button): APP_URL, else Vercel's production domain.
  const appUrl = (env.APP_URL || env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  return {
  define: { __OWNER_EMAIL__: JSON.stringify(ownerEmail), __APP_URL__: JSON.stringify(appUrl) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Mayapuri Stock',
        short_name: 'Stock',
        description: 'Stock book for generator and motor parts',
        lang: 'en-IN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f4c5c',
        theme_color: '#0f4c5c',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell works offline. Data comes from Firestore's own offline cache.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__\//, /^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
  };
});
