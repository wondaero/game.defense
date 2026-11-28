import { Icon } from './Icon.tsx'
import { usePwa } from './pwa.ts'

/** 새 버전이 받아졌을 때 화면 위에 뜨는 띠 (2026-11-28 PWA). 누르면 새로고침해서 적용 */
export function UpdateBanner() {
  const pwa = usePwa()
  if (!pwa.needRefresh) return null
  return (
    <div className="update-banner" role="status">
      <span>
        <Icon name="sparkle" /> 새 버전이 있어요
      </span>
      <button className="primary inline" onClick={pwa.update}>
        새로고침
      </button>
      <button className="link" onClick={pwa.later}>
        나중에
      </button>
    </div>
  )
}
