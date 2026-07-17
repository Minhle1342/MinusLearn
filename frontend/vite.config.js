import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    exclude: ['node_modules/**', 'dist/**', 'src/utils/writingVisuals.test.js', 'src/utils/examWriting.test.js']
  }
})
