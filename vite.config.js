import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'YEELEN AgriConnect',
        short_name: 'AgriConnect',
        description: 'Suivi des cultures, irrigation et gestion agricole',
        theme_color: '#38A169', // Mise à jour avec le nouveau vert principal
        background_color: '#F7FAFC', // Mise à jour avec le fond général
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}']
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // Les dépendances tierces changent bien moins souvent que le code de l app :
        // les isoler leur donne une empreinte de cache stable, si bien qu un déploiement
        // ne réinvalide que le chunk applicatif au lieu de tout le bundle.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
})