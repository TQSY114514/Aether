import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
          // Always split sql.js into its own chunk (WASM + JS).
          if (id.includes('node_modules/sql.js')) return 'sqljs'
          // highlight.js is large (~900 KB); extract it from the main bundle.
          if (id.includes('node_modules/highlight.js')) return 'highlight'
        },
      },
    }
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
