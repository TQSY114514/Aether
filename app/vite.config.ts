/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Expose locale JSON files at /locales/<code>.json in dev mode
function serveLocalesPlugin() {
  return {
    name: 'serve-locales',
    configureServer(server) {
      server.middlewares.use('/locales', (req, res) => {
        const name = req.url?.replace(/^\/locales\//, '') || ''
        const fp = path.resolve(__dirname, 'locales', name)
        if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(fs.readFileSync(fp))
        } else {
          res.statusCode = 404
          res.end('Not found')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    serveLocalesPlugin(),
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
  test: {
    // e2e/launch.test.js is a standalone node script (run via `npm run
    // test:e2e`); keep vitest from auto-discovering it as a test-suite file.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
      '**/e2e/**',
    ],
  },
})
