import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // index.html is now the React SPA entry
      input: { app: path.resolve(__dirname, 'index.html') },
    },
  },
  server: {
    open: '/',
  },
})
