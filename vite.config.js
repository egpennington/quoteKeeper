import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { ocrAssetsPlugin } from './scripts/ocr-assets.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Self-hosted OCR worker/engine/models in public/ocr (SmartScan OCR Lab).
    ocrAssetsPlugin({ models: ['fast', 'best_int'] }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Keep OCR assets and the test-only OCR Lab out of every user's install.
        globIgnores: ['**/node_modules/**/*', 'ocr/**', 'assets/OcrLab-*'],
      },
      manifest: {
        name: 'QuoteKeeper',
        short_name: 'QuoteKeeper',
        description: 'Save, search, and carry your favorite quotes.',
        theme_color: '#8338ec',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
