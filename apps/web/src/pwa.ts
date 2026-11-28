/**
 * PWA (2026-11-28): 서비스 워커 등록 · 새 버전 알림 · 앱 설치.
 * - 새 버전: 바로 바꾸지 않고 needRefresh 를 켬 → 화면의 "새 버전" 띠에서 사용자가 누르면 적용 (게임 도중 끊기지 않게)
 * - 설치: 안드로이드·PC 크롬은 beforeinstallprompt 를 받아 두었다가 설치 버튼에서 띄움. 아이폰은 이 기능이 없어 "공유 → 홈 화면에 추가" 안내
 */
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

type Listener = () => void
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((f) => f())

let needRefresh = false
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let installEvent: InstallPromptEvent | null = null

/** 이미 홈 화면 앱으로 열렸는지 */
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function setupPwa() {
  // 개발 서버에선 서비스 워커 안 씀 (plugin 기본값) → registerSW 는 그냥 아무 일 없음
  applyUpdate = registerSW({
    onNeedRefresh() {
      needRefresh = true
      emit()
    },
  })
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    emit()
  })
}

/** 화면에서 PWA 상태 쓰기 */
export function usePwa() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick((n) => n + 1)
    listeners.add(f)
    return () => void listeners.delete(f)
  }, [])
  return {
    needRefresh,
    update: () => void applyUpdate?.(true),
    later: () => {
      needRefresh = false
      emit()
    },
    canInstall: !!installEvent,
    install: async () => {
      if (!installEvent) return
      await installEvent.prompt()
      await installEvent.userChoice
      installEvent = null
      emit()
    },
    standalone: isStandalone(),
    ios: isIOS(),
  }
}
