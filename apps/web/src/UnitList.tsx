import type { ReactNode } from 'react'
import { baseStats, statScore, type DefenseConfig, type UnitInstance } from '@def/defense'
import { abilityText, unitLook } from './format.ts'

/** 캐릭 목록 줄 · 필터 · 정렬 (막사와 탄 준비 화면이 같이 씀) */

/** 캐릭 목록 보기: 필터(특수능력 있음/없음) + 정렬(높은 순) — 2026-11-27 */
export type RosterView = { filter: 'all' | 'ability' | 'none'; sort: 'score' | 'atk' | 'attackSpeed' | 'agility' | 'range' }
const SORT_LABELS: [RosterView['sort'], string][] = [
  ['score', '점수'],
  ['atk', '공격력'],
  ['attackSpeed', '공속'],
  ['agility', '민첩'],
  ['range', '사거리'],
]
const FILTER_LABELS: [RosterView['filter'], string][] = [
  ['all', '전체'],
  ['ability', '특수능력 있음'],
  ['none', '없음'],
]

export function viewRoster(cfg: DefenseConfig, roster: UnitInstance[], view: RosterView): UnitInstance[] {
  const list = roster.filter((u) => (view.filter === 'all' ? true : view.filter === 'ability' ? !!u.ability : !u.ability))
  // 실제로 쓰는 값(전체 강화·호크아이 반영)으로 높은 순, 같으면 점수 → 원래 순서
  const key = (u: UnitInstance) => (view.sort === 'score' ? statScore(cfg, u) : baseStats(cfg, u)[view.sort])
  return list
    .map((u, i) => ({ u, i, k: key(u), s: statScore(cfg, u) }))
    .sort((a, b) => b.k - a.k || b.s - a.s || a.i - b.i)
    .map((x) => x.u)
}

export function RosterTools(props: { view: RosterView; onChange: (v: RosterView) => void; shown: number; total: number }) {
  const { view } = props
  return (
    <div className="roster-tools">
      <div className="chips">
        {FILTER_LABELS.map(([k, label]) => (
          <button key={k} className={view.filter === k ? 'on' : ''} onClick={() => props.onChange({ ...view, filter: k })}>
            {label}
          </button>
        ))}
        <span className="dim">{props.shown}명</span>
      </div>
      <div className="chips">
        <span className="dim">정렬</span>
        {SORT_LABELS.map(([k, label]) => (
          <button key={k} className={view.sort === k ? 'on' : ''} onClick={() => props.onChange({ ...view, sort: k })}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 캐릭 얼굴: 스프라이트 첫 프레임(몸 + 도구)을 작게 */
export function UnitFace({ body, tool }: { body: string; tool: string | null }) {
  const bg = [tool, body].filter(Boolean).map((id) => `url(sprites/${id}.png)`).join(', ')
  return <span className="face sprite" style={{ backgroundImage: bg }} />
}

/** 능력치 한 줄. 닌자·장군이 올린 값은 ▲ 표시 */
export function statText(cfg: DefenseConfig, u: UnitInstance): string {
  const b = baseStats(cfg, u)
  const v = (now: number, orig: number) => (now !== orig ? `${now}▲` : `${now}`)
  return `공격 ${v(b.atk, u.atk)} · 사거리 ${b.range} · 공속 ${v(b.attackSpeed, u.attackSpeed)} · 민첩 ${v(b.agility, u.agility)}`
}

export function UnitRow(props: {
  u: UnitInstance
  cfg: DefenseConfig
  selected?: boolean
  placed?: boolean
  /** 고를 수 없는 캐릭 (흐리게) */
  dim?: boolean
  onClick?: () => void
  children?: ReactNode
}) {
  const { u } = props
  const look = unitLook(props.cfg, u)
  const ab = abilityText(u)
  return (
    <li className={`${props.selected ? 'sel' : ''} ${props.placed ? 'placed' : ''} ${look.tier === 6 ? 'rainbow-row' : ''} ${look.special === 'trainee' ? 'trainee-row' : ''} ${props.dim ? 'dimmed' : ''}`} onClick={props.onClick}>
      <UnitFace body={look.body} tool={look.tool} />
      <div className="info">
        <div>
          {/* 이름 = 헬멧 색 알약 (밝은 화면에서도 흰색·노랑이 보이게, 2026-11-28) */}
          <b className={`tier-pill t${look.tier} ${look.special === 'trainee' ? 'trainee' : ''}`}>{look.title}</b> {statText(props.cfg, u)}
          {props.placed && <span className="tag">출전</span>}
        </div>
        {ab && (
          <div className="ab" title={ab.desc}>
            ★ {ab.name}: {ab.desc}
          </div>
        )}
      </div>
      {props.children}
    </li>
  )
}

