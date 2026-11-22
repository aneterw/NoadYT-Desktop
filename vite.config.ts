import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, './src')
    }
  },
  build: {
    outDir: path.resolve(root, 'dist'),
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    port: 37345,
    strictPort: true,
    watch: {
      ignored: ['**/target/**', '**/node_modules/**']
    }
  }
})
