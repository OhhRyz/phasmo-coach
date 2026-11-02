/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base './' : l'app fonctionne sur n'importe quel hébergement statique
// (GitHub Pages dans un sous-dossier, Vercel, Netlify…) grâce au HashRouter.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // la nouvelle version prend la main dès qu'elle est téléchargée ; la page se recharge au bon moment
      // (src/serviceWorker.ts, par virtual:pwa-register) : pas de registerSW.js injecté en plus
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        // short_name : le nom proposé sous l'icône de l'écran d'accueil (modifiable sur iPhone avant d'ajouter)
        id: './',
        name: 'Phasmo Coach',
        short_name: 'Phasmo Coach',
        description: "Entraînement hors-jeu pour Phasmophobia : codex, révision espacée, quiz et mises en situation.",
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#33413a',
        theme_color: '#33413a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // « autoUpdate » sans registerSW.js injecté : le plugin ne règle plus ces deux-là de lui-même. La nouvelle
        // version s'active dès qu'elle est téléchargée et prend la main sur les pages ouvertes
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // les textes de licence s'ouvrent tels quels, pas dans l'app
        navigateFallbackDenylist: [/\/licences\//],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
