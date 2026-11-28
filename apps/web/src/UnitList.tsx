import { Icon } from './Icon.tsx'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
/** max = 원래 능력치(특수능력 빼고)가 뽑기 최고값 (2026-11-29 꼬리표 금색) */
export function statTags(cfg: DefenseConfig, u: UnitInstance): { label: string; value: number; up: boolean; max: boolean }[] {
  const b = baseStats(cfg, u)
  return [
    { label: '공격', value: b.atk, up: b.atk !== u.atk, max: u.atk >= cfg.atk.max },
    { label: '사거리', value: b.range, up: b.range !== u.range, max: u.range >= cfg.range.max },
    { label: '공속', value: b.attackSpeed, up: b.attackSpeed !== u.attackSpeed, max: u.attackSpeed >= cfg.attackSpeed.max },
    { label: '민첩', value: b.agility, up: b.agility !== u.agility, max: u.agility >= cfg.agility.max },
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
  /**
   * 쌓는 모양 (2026-11-28, 탄 배치 목록): 1줄 = 얼굴 · 이름 · 버튼(빼기) / 2줄 = 능력치 / 3줄 = 특수능력.
   * 오른쪽 버튼 때문에 능력치가 억지로 줄바뀜되던 것 해결 — 2·3줄은 얼굴 아래까지 꽉 씀
   */
  stacked?: boolean
  /** 이름 옆 작은 꼬리표 (예: 배치한 캐릭의 "공격 칸 6") */
  note?: ReactNode
}) {
  const { u } = props
  const look = unitLook(props.cfg, u)
  const ab = abilityText(u)
  const cls = `${u.ability ? 'has-ab' : ''} ${props.selected ? 'sel' : ''} ${props.placed ? 'placed' : ''} ${look.special === 'trainee' ? 'trainee-row' : ''} ${props.dim ? 'dimmed' : ''}`
  // 출전(판에 배치됨) = 얼굴 오른쪽 위에 겹친 초록 ✓ (2026-11-28, "출전" 글자 꼬리표 대신 — 줄 자리를 안 차지함)
  // 특수능력 있는 캐릭: 얼굴 왼쪽 아래 반짝이 표시 (2026-11-29)
  const abMark = u.ability && (
    <b className="ab-mark" aria-label="특수능력 있음">
      <Icon name="sparkle" size={11} />
    </b>
  )
  const placedMark = props.placed && (
    <b className="placed-mark" title="출전" aria-label="출전">
      ✓
    </b>
  )
  const name = (
    <div className="unit-name">
      <b className={`tier-pill t${look.tier} ${look.special === 'trainee' ? 'trainee' : ''}`}>{look.title}</b>
      {props.note && <span className="tag note">{props.note}</span>}
    </div>
  )
  const stats = (
    <div className="stat-tags">
      {statTags(props.cfg, u).map((t) => (
        <span key={t.label} className={`${t.up ? 'up' : ''} ${t.max ? 'max' : ''}`} title={t.max ? '최고값' : undefined}>
          {t.label} <b>{t.value}</b>
          {t.up && '▲'}
        </span>
      ))}
    </div>
  )
  const abBox = ab && (
    // 2026-11-28: "특수능력: 이름" 은 상자 밖, 설명만 상자(p) — 최대 3줄, 넘치면 상자 안에서 스크롤
    <div className="ab2" title={ab.desc}>
      <b className="ab2-title">
        특수능력: <span>{ab.name}</span>
      </b>
      <AbBox>
        <AbilityDesc name={ab.name} desc={ab.desc} />
      </AbBox>
    </div>
  )
  if (props.stacked)
    return (
      <li data-unit-id={u.id} className={`stacked ${cls}`} onClick={props.onClick}>
        <div className="row-top">
          <span className="face-wrap">
            <UnitFace body={look.body} tool={look.tool} rainbow={look.tier === 6} />
            {placedMark}
            {abMark}
          </span>
          {name}
          {props.children && <span className="row-actions">{props.children}</span>}
        </div>
        {stats}
        {abBox}
      </li>
    )
  return (
    // 2026-11-29 막사 목록: 위 = 얼굴 | 이름 · 능력치 / 아래(줄 폭 전체) = 특수능력
    <li data-unit-id={u.id} className={`split ${cls}`} onClick={props.onClick}>
      <div className="row-top">
        <span className="face-wrap">
          <UnitFace body={look.body} tool={look.tool} rainbow={look.tier === 6} />
          {placedMark}
          {abMark}
        </span>
        <div className="info">
          {name}
          {stats}
        </div>
        {props.children}
      </div>
      {abBox}
    </li>
  )
}


/**
 * 특수능력 설명 상자 (2026-11-29): 3줄까지는 넘침 숨김(스크롤 없음) → 화면 전체 스크롤이 상자에 걸리지 않음.
 * 내용이 실제로 3줄을 넘을 때만 상자 안 스크롤을 켬 (크기가 바뀌면 다시 잼)
 */
export function AbBox({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [scroll, setScroll] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setScroll(el.scrollHeight > el.clientHeight + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])
  return (
    <p ref={ref} className={`ab2-box ${scroll ? 'scrolls' : ''}`}>
      {children}
    </p>
  )
}
