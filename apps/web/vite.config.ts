import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: appRoot,
  cacheDir: '../../node_modules/.vite/leavesflow-web',
  plugins: [react()],
  server: {
    port: 5173,
  },
})
