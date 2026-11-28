import { spriteList } from './sprites.ts'

/**
 * 스프라이트 모아 보기 (개발자 탭, 2026-11-28)
 * 예전엔 빌드 때 만든 public/sprites/preview.html 을 열었는데, 배포(Vercel) 빌드에선 그 파일이 안 생겨 404 →
 * art.mjs 에서 바로 그린 시트를 화면 안에서 보여 줌 (파일·빌드 단계 필요 없음)
 */
export function SpriteGallery() {
  const list = spriteList()
  return (
    <div className="sprite-gallery">
      <p className="dim">{list.length}개 · 한 줄 = 모션 하나, 왼쪽부터 프레임</p>
      {list.map((s) => (
        <div key={s.id} className="sg-item">
          <b>
            {s.name} <small className="dim">{s.id}</small>
          </b>
          {s.url && <img src={s.url} alt={s.name} style={{ width: Math.min(100, s.cols * 25) + '%' }} />}
          <span className="dim">{s.motions.join(' · ')}</span>
        </div>
      ))}
    </div>
  )
}
