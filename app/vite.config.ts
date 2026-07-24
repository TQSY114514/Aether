import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-locales',
      closeBundle() {
        const srcDir = path.resolve(__dirname, 'locales')
        const dstDir = path.resolve(__dirname, 'dist/locales')
        if (!fs.existsSync(srcDir)) return
        if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })
        for (const f of fs.readdirSync(srcDir)) {
          fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f))
        }
      }
    }
  ],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/sql.js')) return 'sqljs'
          if (id.includes('node_modules/highlight.js')) return 'highlight'
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
