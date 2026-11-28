import type { ReactNode } from 'react'
import { baseStats, statScore, type DefenseConfig, type UnitInstance } from '@def/defense'
import { abilityText, unitLook } from './format.ts'
import { sheetGrid, sheetUrl } from './sprites.ts'

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

/**
 * 특수능력 설명 (2026-11-28): 괄호 안 보충 설명을 문장에서 빼서 다음 줄에 작게 — 괄호가 문장 중간에 끼어 헷갈리지 않게.
 * 예) "10% 확률로 0.5초 스턴 (쿨타임 3초)" → 본문 "10% 확률로 0.5초 스턴" / 보충 "쿨타임 3초"
 */
export function splitDesc(name: string, desc: string): { main: string; notes: string[] } {
  const text = desc.replace(`${name}: `, '')
  const notes: string[] = []
  const main = text.replace(/\s*\(([^()]*)\)/g, (_, n: string) => {
    notes.push(...n.split(/,\s*/).map((x) => x.trim()))
    return ''
  })
  return { main: main.replace(/\s+·\s*$/, '').trim(), notes }
}

export function AbilityDesc({ name, desc }: { name: string; desc: string }) {
  const { main, notes } = splitDesc(name, desc)
  return (
    <>
      <span className="ab-desc">{main}</span>
      {notes.length > 0 && <span className="ab-note">{notes.join(' · ')}</span>}
    </>
  )
}

export function RosterTools(props: { view: RosterView; onChange: (v: RosterView) => void; roster: readonly UnitInstance[]; /** 줄 맨 왼쪽 (예: 100/100) */ lead?: ReactNode }) {
  const { view, roster } = props
  // 2026-11-28: 한 줄 — 왼쪽 보기, 오른쪽 정렬 (280px 에서도 한 줄). 인원수는 보기 목록 안에
  const count = (f: RosterView['filter']) => (f === 'all' ? roster.length : roster.filter((u) => (f === 'ability' ? !!u.ability : !u.ability)).length)
  return (
    <div className="roster-tools">
      {props.lead && <span className="rt-lead">{props.lead}</span>}
      {/* 보기 · 정렬은 한 묶음으로 오른쪽 (2026-11-28) */}
      <div className="rt-picks">
        <select aria-label="보기" value={view.filter} onChange={(e) => props.onChange({ ...view, filter: e.target.value as RosterView['filter'] })}>
          {FILTER_LABELS.map(([k, label]) => (
            <option key={k} value={k}>
              {k === 'all' ? '전체' : k === 'ability' ? '능력 있음' : '능력 없음'} {count(k)}
            </option>
          ))}
        </select>
        <select aria-label="정렬" value={view.sort} onChange={(e) => props.onChange({ ...view, sort: e.target.value as RosterView['sort'] })}>
          {SORT_LABELS.map(([k, label]) => (
            <option key={k} value={k}>
              {label} 높은 순
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** 캐릭 얼굴: 스프라이트 첫 프레임(몸 + 도구)을 작게 */
export function UnitFace({ body, tool, rainbow, big }: { body: string; tool: string | null; rainbow?: boolean; big?: boolean }) {
  // SVG 시트를 그대로 배경으로 (PNG 없음). 그림 층(.face-art)은 프레임 여백까지 포함해 칸보다 크게 깔아
  // 도구·불꽃이 칸 밖으로 나가도 잘리지 않게 (2026-11-28)
  const bg = [tool, body].map((id) => (id ? sheetUrl(id) : null)).filter(Boolean).map((u) => `url(${u})`).join(', ')
  const grid = sheetGrid(body) ?? { cols: 6, rows: 3 }
  const face = (
    <span className={`face sprite ${big ? 'big' : ''}`}>
      <span className="face-art" style={{ backgroundImage: bg, backgroundSize: `${grid.cols * 100}% ${grid.rows * 100}%` }} />
    </span>
  )
  // 무지개 캐릭: 얼굴 칸만 흐르는 무지개 틀
  return rainbow ? <span className="face-rainbow">{face}</span> : face
}

/** 능력치 4개 (실제로 쓰는 값). 특수능력(전체 강화·호크아이)으로 올라간 값은 up */
export function statTags(cfg: DefenseConfig, u: UnitInstance): { label: string; value: number; up: boolean }[] {
  const b = baseStats(cfg, u)
  return [
    { label: '공격', value: b.atk, up: b.atk !== u.atk },
    { label: '사거리', value: b.range, up: b.range !== u.range },
    { label: '공속', value: b.attackSpeed, up: b.attackSpeed !== u.attackSpeed },
    { label: '민첩', value: b.agility, up: b.agility !== u.agility },
  ]
}

/** 능력치 한 줄 글자 (올라간 값은 ▲) */
export function statText(cfg: DefenseConfig, u: UnitInstance): string {
  return statTags(cfg, u)
    .map((t) => `${t.label} ${t.value}${t.up ? '▲' : ''}`)
    .join(' · ')
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
    <li data-unit-id={u.id} className={`${props.selected ? 'sel' : ''} ${props.placed ? 'placed' : ''} ${look.special === 'trainee' ? 'trainee-row' : ''} ${props.dim ? 'dimmed' : ''}`} onClick={props.onClick}>
      <span className="face-wrap">
        <UnitFace body={look.body} tool={look.tool} rainbow={look.tier === 6} />
        {props.selected && <b className="sel-check">✓</b>}
      </span>
      <div className="info">
        {/* 2026-11-28: 첫 줄 이름 · 둘째 줄 능력치 꼬리표 · 셋째 줄 특수능력(있을 때만) */}
        <div className="unit-name">
          {/* 이름 = 헬멧 색 알약 (밝은 화면에서도 흰색·노랑이 보이게) */}
          <b className={`tier-pill t${look.tier} ${look.special === 'trainee' ? 'trainee' : ''}`}>{look.title}</b>
          {props.placed && <span className="tag">출전</span>}
        </div>
        <div className="stat-tags">
          {statTags(props.cfg, u).map((t) => (
            <span key={t.label} className={t.up ? 'up' : ''}>
              {t.label} <b>{t.value}</b>
              {t.up && '▲'}
            </span>
          ))}
        </div>
        {ab && (
          <div className="ab" title={ab.desc}>
            {/* 첫 줄 = 능력 이름, 둘째 줄 = 설명 (설명 안에 이름이 또 나오면 뺌) */}
            <b className="ab-name">★ {ab.name}</b>
            <AbilityDesc name={ab.name} desc={ab.desc} />
          </div>
        )}
      </div>
      {props.children}
    </li>
  )
}

