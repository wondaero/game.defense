import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // 예전 프로젝트(5173)와 겹치지 않게
  server: { port: 5180 },
})
