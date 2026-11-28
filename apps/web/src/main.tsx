import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { UpdateBanner } from './UpdateBanner.tsx'
import { DialogHost } from './dialog.tsx'
import { SoundAsk } from './SoundAsk.tsx'
// 글꼴 Pretendard (2026-11-28): 가변 굵기 · 필요한 글자만 나눠 받는 방식(dynamic subset) → 첫 화면에 쓰는 글자 조각만 받음
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './styles.css'
import { setupPwa } from './pwa.ts'

setupPwa()

// 손가락 확대(핀치 줌)·두 번 탭 확대 막기 (2026-11-29). 아이폰 Safari 는 viewport 설정을 무시해서 제스처 이벤트도 막음
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false },
)
// 두 번 탭 확대는 CSS touch-action: manipulation 으로 막음 (빠른 연속 탭을 막으면 '정보 7번 누르기' 같은 빠른 터치가 안 먹어서 JS 로는 안 막음)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateBanner />
    <DialogHost />
    <SoundAsk />
  </StrictMode>,
)
