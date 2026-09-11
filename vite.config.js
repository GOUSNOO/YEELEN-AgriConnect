import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { COLORS } from './src/lib/theme.js'

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
        // Lues depuis theme.js plutôt que recopiées : ces deux valeurs étaient restées sur
        // l'ancienne palette (#38A169 sur #F7FAFC) longtemps après le passage au terreux, si
        // bien que l'écran de démarrage et la barre système d'une application installée ne
        // ressemblaient plus à l'application. Le fichier n'a aucune dépendance, donc la config
        // de build peut le lire — et la divergence ne peut plus se reproduire en silence.
        theme_color: COLORS.green,
        background_color: COLORS.bg,
        lang: 'fr',
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