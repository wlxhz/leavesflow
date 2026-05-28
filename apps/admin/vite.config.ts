import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appRoot = fileURLToPath(new URL('.', import.meta.url))
const base = process.env.LEAVESFLOW_ADMIN_BASE || '/admin/'

export default defineConfig({
  root: appRoot,
  base,
  cacheDir: '../../node_modules/.vite/leavesflow-admin',
  plugins: [react()],
  preview: {
    host: '::',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  server: {
    host: '::',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
