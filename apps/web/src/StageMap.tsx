import { Icon } from './Icon.tsx'
import { useEffect, useRef } from 'react'
import { LAST_NORMAL_STAGE, STAGES_PER_MAP, stageMapId } from '@def/defense'
import { chapterTheme, stageName, stageShort } from './format.ts'

/**
 * 탄 고르기: 풀밭 위 구불구불한 길에 탄이 동그라미로 놓인 지도.
 * **아래 = 1탄, 위 = 100탄** (2026-11-27: 아래에서 위로 올라가며 진행)
 * - 맵(알파벳)이 바뀌는 4탄마다 띠 색이 바뀌고 옆에 "맵 Q" 표지판
 * - 100탄 위로 무한 탄이 이어짐 (∞1, ∞2 …, 2026-11-28 무한 버튼 대신)
 * - 깬 탄 = 초록 + ✓, 다음 할 탄 = 금색으로 반짝, 우두머리 탄 = 크고 빨갛고 왕관, 못 여는 탄 = 회색 자물쇠
 */
const STEP = 76 // 탄 사이 세로 간격 (px)
const TOP = 56

const nodeX = (i: number) => 50 + 30 * Math.sin(i * 0.8) // 가로 위치 (%)
const nodeY = (i: number) => TOP + i * STEP

/** 풀밭 꽃잎 색 (분홍·빨강·하양·보라·주황·하늘) */
const FLOWER_COLORS = ['#ff8fb1', '#ff6b6b', '#ffffff', '#c792ea', '#ffb74d', '#81d4fa']

/** 칸마다 고정된 무작위 (장식 위치) */
const rand = (k: number) => {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function StageMap(props: { count: number; best: number; stars: Record<number, number>; maxOpen: number; onOpen: (n: number) => void; /** 아래 메뉴에 가리는 높이 — 1탄 아래로 길·풀밭이 이만큼 더 이어짐 */ bottomSpace?: number }) {
  const { count, best, stars, maxOpen, onOpen, bottomSpace = 0 } = props
  const boxRef = useRef<HTMLDivElement>(null)
  const current = Math.min(best + 1, count)
  const height = nodeY(count - 1) + TOP + bottomSpace
  /** n탄이 위에서 몇 번째 자리인가 (100탄 = 0) */
  const pos = (n: number) => count - n

  // 처음 열면 다음 할 탄이 가운데 오게
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    // 처음 자리 잡기는 바로 (부드러운 스크롤이면 화면을 열자마자 중간에 걸려 보임)
    box.style.scrollBehavior = 'auto'
    box.scrollTop = Math.max(0, nodeY(pos(current)) - box.clientHeight / 2)
    box.style.scrollBehavior = ''
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
          // 이 맵의 탄 first~last (1부터). 화면에선 last 가 위, first 가 아래
          const first = c * STAGES_PER_MAP + 1
          const last = Math.min(first + STAGES_PER_MAP - 1, count)
          const topPos = pos(last)
          const bottomPos = pos(first)
          const top = topPos ? (nodeY(topPos - 1) + nodeY(topPos)) / 2 : 0
          const bottom = bottomPos === count - 1 ? height : (nodeY(bottomPos) + nodeY(bottomPos + 1)) / 2
          const id = stageMapId(first)
          const left = nodeX(topPos) > 50
          return (
            <div key={c} className={`chapter ${chapterTheme(c)}`} style={{ top, height: bottom - top }}>
              {/* 얼음 맵: 눈송이가 천천히 내림 (2026-11-28, CSS 애니메이션 · 위치·속도는 매번 같게) */}
              {chapterTheme(c) === 'ice' && (
                <span className="snow" aria-hidden>
                  {Array.from({ length: 14 }, (_, k) => (
                    <i
                      key={k}
                      style={{
                        left: `${4 + rand(c * 31 + k) * 92}%`,
                        animationDuration: `${5 + rand(c * 17 + k + 5) * 5}s`,
                        animationDelay: `${-rand(c * 13 + k + 9) * 10}s`,
                        fontSize: `${9 + Math.floor(rand(c * 7 + k + 3) * 9)}px`,
                        ['--sway' as string]: `${(rand(c * 5 + k) - 0.5) * 40}px`,
                      }}
                    >
                      {k % 3 === 0 ? '❄' : '•'}
                    </i>
                  ))}
                </span>
              )}
              <span className={`chapter-sign ${left ? 'left' : 'right'}`}>
                {first > LAST_NORMAL_STAGE && <em className="inf">무한</em>}
                맵 <b>{id.toUpperCase()}</b>
                <small>{first > LAST_NORMAL_STAGE ? `∞${first - LAST_NORMAL_STAGE}~${last - LAST_NORMAL_STAGE}` : `${first}~${last}탄`}</small>
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
        {Array.from({ length: Math.floor(count * 2) }, (_, k) => {
          // 장식이 놓인 자리의 탄 → 그 구간이 얼음이면 눈송이
          const y = rand(k + 999) * height
          const n = Math.min(count, Math.max(1, count - Math.round((y - TOP) / STEP)))
          const ice = chapterTheme(Math.floor((n - 1) / STAGES_PER_MAP)) === 'ice'
          const xPct = 4 + rand(k) * 92
          const left = `${xPct}%`
          // 탄 동그라미·별 위에 겹치지 않게: 근처 탄 자리 가까우면 건너뜀 (2026-11-28)
          if ([n - 1, n, n + 1].some((m) => m >= 1 && m <= count && Math.abs(nodeX(pos(m)) - xPct) < 16 && Math.abs(nodeY(pos(m)) - y) < 42)) return null
          // 풀밭: 가끔(약 40%) 색 있는 꽃 — 꽃잎 5장 + 노란 꽃술 (2026-11-28)
          if (!ice && rand(k + 333) < 0.4) {
            const color = FLOWER_COLORS[Math.floor(rand(k + 444) * FLOWER_COLORS.length)]!
            const size = 13 + Math.floor(rand(k + 555) * 7)
            return (
              <svg key={k} className="deco flower" viewBox="-10 -10 20 20" width={size} height={size} style={{ left, top: y, transform: `translate(-50%, -50%) rotate(${Math.floor(rand(k + 666) * 72)}deg)` }}>
                {[0, 72, 144, 216, 288].map((r) => (
                  <ellipse key={r} cx="0" cy="-4.6" rx="3.2" ry="4.4" transform={`rotate(${r})`} fill={color} stroke="rgba(63,49,35,0.45)" strokeWidth="0.8" />
                ))}
                <circle r="2.6" fill="#ffd54f" stroke="rgba(63,49,35,0.45)" strokeWidth="0.8" />
              </svg>
            )
          }
          return (
            <span key={k} className={`deco ${ice ? 'ice' : ''}`} style={{ left, top: y }}>
              {ice ? (rand(k + 77) < 0.5 ? '❄' : '✦') : rand(k + 77) < 0.35 ? '✿' : '❦'}
            </span>
          )
        })}

        {Array.from({ length: count }, (_, i) => {
          const n = i + 1
          const boss = n % 10 === 0
          const cleared = n <= best
          const locked = n > maxOpen
          const inf = n > LAST_NORMAL_STAGE
          const cls = ['node', inf && 'inf', cleared && `g${Math.max(1, Math.min(3, stars[n] ?? 1))}`, boss && 'boss', cleared && 'cleared', n === current && !cleared && 'current', locked && 'locked'].filter(Boolean).join(' ')
          return (
            <button
              key={n}
              className={cls}
              style={{ left: `${nodeX(pos(n))}%`, top: nodeY(pos(n)) }}
              disabled={locked}
              onClick={() => onOpen(n)}
              title={boss ? `${stageName(n)} · 우두머리` : stageName(n)}
            >
              {boss && <span className="crown">
                  {/* 얼음 맵이면 얼음 왕관 */}
                  <Icon name={chapterTheme(Math.floor((n - 1) / STAGES_PER_MAP)) === 'ice' ? 'iceCrown' : 'crown'} />
                </span>}
              {n === current && !cleared && !locked && <span className="go-tag">도전!</span>}
              <span className="num">{stageShort(n)}</span>
              {cleared && (
                <span className="node-stars">
                  {[1, 2, 3].map((k) => (
                    <i key={k} className={k <= (stars[n] ?? 1) ? 'on' : ''}>★</i>
                  ))}
                </span>
              )}
              {locked && <span className="badge lock">
                  <Icon name="lock" />
                </span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
