import { useEffect, useRef } from 'react'
import { STAGES_PER_MAP, stageMapId } from '@def/defense'

/**
 * 탄 고르기: 풀밭 위 구불구불한 길에 탄이 동그라미로 놓인 지도 (위 = 1탄 → 아래로 진행).
 * - 맵(알파벳)이 바뀌는 4탄마다 띠 색이 바뀌고 옆에 "맵 Q" 표지판
 * - 깬 탄 = 초록 + ✓, 다음 할 탄 = 금색으로 반짝, 우두머리 탄 = 크고 빨갛고 왕관, 못 여는 탄 = 회색 자물쇠
 */
const STEP = 76 // 탄 사이 세로 간격 (px)
const TOP = 56

const nodeX = (i: number) => 50 + 30 * Math.sin(i * 0.8) // 가로 위치 (%)
const nodeY = (i: number) => TOP + i * STEP

/** 칸마다 고정된 무작위 (장식 위치) */
const rand = (k: number) => {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function StageMap(props: { count: number; best: number; maxOpen: number; onOpen: (n: number) => void }) {
  const { count, best, maxOpen, onOpen } = props
  const boxRef = useRef<HTMLDivElement>(null)
  const current = Math.min(best + 1, count)
  const height = nodeY(count - 1) + TOP

  // 처음 열면 다음 할 탄이 가운데 오게
  useEffect(() => {
    const box = boxRef.current
    if (box) box.scrollTop = Math.max(0, nodeY(current - 1) - box.clientHeight / 2)
  }, [current])

  // 길: 탄 사이를 세로로 부드럽게 휘는 곡선
  let d = `M ${nodeX(0)} ${nodeY(0) - TOP}`
  for (let i = 0; i < count; i++) {
    const [x0, y0] = i ? [nodeX(i - 1), nodeY(i - 1)] : [nodeX(0), nodeY(0) - TOP]
    const [x1, y1] = [nodeX(i), nodeY(i)]
    const my = (y0 + y1) / 2
    d += ` C ${x0} ${my} ${x1} ${my} ${x1} ${y1}`
  }
  d += ` L ${nodeX(count - 1)} ${height}`

  const chapters = Math.ceil(count / STAGES_PER_MAP)
  return (
    <div className="stage-map" ref={boxRef}>
      <div className="stage-map-inner" style={{ height }}>
        {/* 맵(알파벳)마다 띠 */}
        {Array.from({ length: chapters }, (_, c) => {
          const first = c * STAGES_PER_MAP
          const top = c ? (nodeY(first - 1) + nodeY(first)) / 2 : 0
          const last = Math.min(first + STAGES_PER_MAP, count) - 1
          const bottom = last === count - 1 ? height : (nodeY(last) + nodeY(last + 1)) / 2
          const id = stageMapId(first + 1)
          const left = nodeX(first) > 50
          return (
            <div key={c} className={`chapter ${c % 2 ? 'alt' : ''}`} style={{ top, height: bottom - top }}>
              <span className={`chapter-sign ${left ? 'left' : 'right'}`}>
                맵 <b>{id.toUpperCase()}</b>
                <small>
                  {first + 1}~{last + 1}탄
                </small>
              </span>
            </div>
          )
        })}

        <svg className="stage-road" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height}>
          <path d={d} className="road-edge" vectorEffect="non-scaling-stroke" />
          <path d={d} className="road-fill" vectorEffect="non-scaling-stroke" />
          <path d={d} className="road-dash" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* 풀밭 장식 (꽃·풀) */}
        {Array.from({ length: Math.floor(count * 1.2) }, (_, k) => (
          <span key={k} className="deco" style={{ left: `${4 + rand(k) * 92}%`, top: rand(k + 999) * height }}>
            {rand(k + 77) < 0.35 ? '✿' : '❦'}
          </span>
        ))}

        {Array.from({ length: count }, (_, i) => {
          const n = i + 1
          const boss = n % 10 === 0
          const cleared = n <= best
          const locked = n > maxOpen
          const cls = ['node', boss && 'boss', cleared && 'cleared', n === current && !cleared && 'current', locked && 'locked'].filter(Boolean).join(' ')
          return (
            <button
              key={n}
              className={cls}
              style={{ left: `${nodeX(i)}%`, top: nodeY(i) }}
              disabled={locked}
              onClick={() => onOpen(n)}
              title={boss ? `${n}탄 · 우두머리` : `${n}탄`}
            >
              {boss && <span className="crown">👑</span>}
              <span className="num">{n}</span>
              {cleared && <span className="badge">✓</span>}
              {locked && <span className="badge lock">🔒</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
