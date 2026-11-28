import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    /**
     * PWA (2026-11-28): 홈 화면에 설치 · 오프라인으로도 열림.
     * - registerType 'prompt': 새 버전이 오면 바로 새로고침하지 않고 화면에 "새 버전" 띠 → 사용자가 누를 때 (게임 도중 끊기지 않게)
     * - 아이콘은 public/icons (npm run icons 로 만듦)
     */
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-64.png'],
      manifest: {
        name: '슬라임 디펜스',
        short_name: '슬라임 디펜스',
        description: '캐릭을 배치해 슬라임을 막는 디펜스 게임',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#eef6e2',
        theme_color: '#6db34f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 앱 파일은 미리 받아 두고(오프라인), /dev 같은 주소도 index.html 로
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        globIgnores: ['sprites/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  base: './',
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // React 는 거의 안 바뀜 → 따로 떼어 두면 게임만 고쳐 올려도 휴대폰이 React 를 다시 안 받음 (2026-11-28 최적화)
        manualChunks: { react: ['react', 'react-dom'] },
      },
    },
  },
  // 예전 프로젝트(5173)와 겹치지 않게
  server: { port: 5180 },
})
