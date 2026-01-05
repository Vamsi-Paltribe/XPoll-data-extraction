import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5174,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-worker': ['pdfjs-dist/build/pdf.worker.mjs'],
          'pdf-lib': ['pdfjs-dist'],
          'ocr-lib': ['tesseract.js'],
          'data-utils': ['xlsx', 'papaparse'],
          'vendor': ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        }
      }
    }
  }
})
