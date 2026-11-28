import { stageName } from './format.ts'

/**
 * 탄이 끝났을 때 판 위에 크게 띄우는 결과 (2026-11-27)
 * - 성공: "클리어!" 띠가 떨어지고 → 별이 하나씩 튀어나오고 → 위에서 색종이
 * - 실패: 판이 회색으로 어두워지고 "실패…"
 */
const CONFETTI_COLORS = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9', '#ffffff']

/** 색종이 조각 위치·색은 매번 같게 (화면이 다시 그려져도 안 튀게) */
const confetti = Array.from({ length: 46 }, (_, i) => {
  const r = (k: number) => (((i + 1) * 9301 + k * 49297) % 233280) / 233280
  return {
    left: r(1) * 100,
    delay: r(2) * 1.4,
    dur: 2.2 + r(3) * 1.6,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    w: 6 + r(4) * 6,
    rot: r(5) * 360,
    drift: (r(6) - 0.5) * 80,
  }
})

export function ResultOverlay(props: {
  cleared: boolean
  stars: number
  stage: number
  detail: string
  /** 받은 보상 (2026-11-27): 화폐 + 처음 깬 탄이면 가끔 권 */
  reward?: { gold: number; ticket: string | null; firstClear: boolean } | null
  onNext: () => void
  onRetry: () => void
  onSelect: () => void
}) {
  const { cleared, stars, stage, detail } = props
  return (
    <div className={`result-overlay ${cleared ? 'win' : 'lose'}`}>
      {cleared && (
        <div className="confetti" aria-hidden>
          {confetti.map((c, i) => (
            <i
              key={i}
              style={
                {
                  left: `${c.left}%`,
                  width: c.w,
                  height: c.w * 0.45,
                  background: c.color,
                  animationDelay: `${0.5 + c.delay}s`,
                  animationDuration: `${c.dur}s`,
                  '--rot': `${c.rot}deg`,
                  '--drift': `${c.drift}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="result-card">
        <div className="result-banner">{cleared ? `${stageName(stage)} 클리어!` : '실패…'}</div>
        {cleared ? (
          <>
            <div className="result-big-stars">
              {[1, 2, 3].map((k) => (
                <span key={k} className={k <= stars ? 'on' : 'off'} style={{ animationDelay: `${0.35 + k * 0.28}s` }}>
                  ★
                </span>
              ))}
            </div>
            <div className="result-sub">{stars === 3 ? '완벽 방어! 한 마리도 안 놓쳤어요' : stars === 2 ? '1마리 놓쳤어요' : '아슬아슬! 2마리 놓쳤어요'}</div>
          </>
        ) : (
          <div className="result-sub">3마리가 통과했어요. 배치를 바꿔서 다시 도전!</div>
        )}
        {props.reward && props.reward.gold > 0 && (
          <div className="result-reward">
            <span>
              💰 +{props.reward.gold} 골드{props.reward.firstClear ? ' (처음 깬 탄)' : !cleared ? ' (도전 보상)' : ' (다시 깬 탄 1/10)'}
            </span>
            {props.reward.ticket && <span className="reward-ticket">🎉 {props.reward.ticket} +1!</span>}
          </div>
        )}
        <div className="result-detail">{detail}</div>
        <div className="result-buttons">
          {cleared && (
            <button className="primary inline" onClick={props.onNext}>
              다음 탄 ({stageName(stage + 1)}) →
            </button>
          )}
          <button className={cleared ? '' : 'primary inline'} onClick={props.onRetry}>
            {cleared ? '다시 하기' : '배치 바꿔서 다시'}
          </button>
          <button onClick={props.onSelect}>탄 고르기</button>
        </div>
      </div>
    </div>
  )
}
