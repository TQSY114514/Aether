/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
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
    // forks pool（独立进程，进程隔离比 threads 更稳）：700+ 测试在 2 核 CI
    // runner 上 threads 并发会导致 worker 崩溃/超时误报（存量 flaky）。
    // vitest 4 已把 poolOptions 提升为顶层选项（maxWorkers）。
    pool: 'forks',
    maxWorkers: 2,
  },
})
