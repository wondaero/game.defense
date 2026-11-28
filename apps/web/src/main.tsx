import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { UpdateBanner } from './UpdateBanner.tsx'
// 글꼴 Pretendard (2026-11-28): 가변 굵기 · 필요한 글자만 나눠 받는 방식(dynamic subset) → 첫 화면에 쓰는 글자 조각만 받음
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './styles.css'
import { setupPwa } from './pwa.ts'

setupPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateBanner />
  </StrictMode>,
)
