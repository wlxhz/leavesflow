import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: appRoot,
  cacheDir: '../../node_modules/.vite/leavesflow-web',
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  plugins: [react()],
  preview: {
    host: '::',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  server: {
    host: '::',
    port: 5173,
    strictPort: true,
  },
})
