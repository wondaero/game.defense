import { useState, type ReactNode } from 'react'
import {
  MERGE_COUNTS,
  MERGE_TABLE,
  STAT_KEY_NAMES,
  STAT_KEYS,
  STAT_TICKET_KEEP,
  statTier,
  TICKET_NAMES,
  type Account,
  type BarracksAction,
  type BarracksOutcome,
  type DefenseConfig,
  type StatGrade,
  type StatKey,
  type TicketKind,
  type UnitInstance,
} from '@def/defense'
import { RosterTools, UnitRow, viewRoster, type RosterView } from './UnitList.tsx'
import type { GameApi } from './api/api.ts'

/**
 * 막사 (2026-11-27): 캐릭 목록 + 캐릭 뽑기 · 능력치 변경 · 특수능력 변경 · 합성.
 * 화면은 계정을 직접 고치지 않고 api.barracks(요청)만 보냄 → 검사·난수·저장은 api 쪽(지금 localApi, 나중에 서버)
 */
type Mode = null | { kind: 'stat'; grade: StatGrade } | { kind: 'ability' } | { kind: 'merge'; ids: string[] }
type Popup =
  | null
  | { kind: 'drawn'; unit: UnitInstance }
  | { kind: 'statPick'; grade: StatGrade; unit: UnitInstance; keep: StatKey[] }
  | { kind: 'abilityPick'; unit: UnitInstance }
  | { kind: 'changed'; title: string; before: UnitInstance; after: UnitInstance; note?: string }
  | { kind: 'mergeConfirm'; ids: string[] }
  | { kind: 'merged'; count: number; reward: TicketKind }

const STAT_GRADES: StatGrade[] = ['statNormal', 'statHigh', 'statTop']
const GRADE_SHORT: Record<StatGrade, string> = { statNormal: '보통', statHigh: '상급', statTop: '최상급' }
const TICKET_ICON: Record<TicketKind, string> = { draw: '🎟️', statNormal: '🔄', statHigh: '🔄', statTop: '🔄', ability: '✨' }

export function Barracks(props: {
  cfg: DefenseConfig
  account: Account
  api: GameApi
  /** removedIds = 합성으로 없어진 캐릭 (배치에서도 빼야 함) */
  onAccount: (next: Account, removedIds?: string[]) => void
  view: RosterView
  onView: (v: RosterView) => void
  onReroll: () => void
}) {
  const { cfg, account } = props
  const { units, tickets } = account
  const [mode, setMode] = useState<Mode>(null)
  const [popup, setPopup] = useState<Popup>(null)
  const [busy, setBusy] = useState(false)
  const shown = viewRoster(cfg, units, props.view)

  /** 요청 보내기 → 새 계정 받기. 안 되면 이유를 알림 */
  const send = async (action: BarracksAction): Promise<BarracksOutcome | null> => {
    if (busy) return null
    setBusy(true)
    try {
      const { account: next, outcome } = await props.api.barracks(action)
      props.onAccount(next, action.type === 'merge' ? action.unitIds : undefined)
      return outcome
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  const draw = async () => {
    const o = await send({ type: 'draw' })
    if (o?.type === 'drawn') setPopup({ kind: 'drawn', unit: o.unit })
  }

  const onUnitClick = (u: UnitInstance) => {
    if (!mode) return
    if (mode.kind === 'stat') {
      if (tickets[mode.grade] < 1) return alert(`${TICKET_NAMES[mode.grade]}이 없어요`)
      setPopup({ kind: 'statPick', grade: mode.grade, unit: u, keep: [] })
    } else if (mode.kind === 'ability') {
      if (!u.ability) return alert('특수능력이 없는 캐릭엔 못 써요')
      if (tickets.ability < 1) return alert('특수능력 변경권이 없어요')
      setPopup({ kind: 'abilityPick', unit: u })
    } else {
      const ids = mode.ids.includes(u.id) ? mode.ids.filter((x) => x !== u.id) : [...mode.ids, u.id]
      setMode({ kind: 'merge', ids })
    }
  }

  const doStat = async (grade: StatGrade, unit: UnitInstance, keep: StatKey[]) => {
    const o = await send({ type: 'rerollStats', unitId: unit.id, grade, keep })
    if (o?.type === 'changed') setPopup({ kind: 'changed', title: `${TICKET_NAMES[grade]} 사용`, before: o.before, after: o.after, note: o.gainedAbility ? '✨ 특수능력이 생겼어요! (5% 행운)' : undefined })
    else setPopup(null)
  }
  const doAbility = async (unit: UnitInstance) => {
    const o = await send({ type: 'rerollAbility', unitId: unit.id })
    if (o?.type === 'changed') setPopup({ kind: 'changed', title: '특수능력 변경권 사용', before: o.before, after: o.after })
    else setPopup(null)
  }
  const doMerge = async (ids: string[]) => {
    const o = await send({ type: 'merge', unitIds: ids })
    if (o?.type === 'merged') {
      setMode(null)
      setPopup({ kind: 'merged', count: o.count, reward: o.reward })
    } else setPopup(null)
  }

  const mergeIds = mode?.kind === 'merge' ? mode.ids : []
  const mergeOk = MERGE_TABLE[mergeIds.length]

  return (
    <section>
      {/* 가진 권 */}
      <div className="tickets">
        {(Object.keys(TICKET_NAMES) as TicketKind[]).map((k) => (
          <span key={k} className={`ticket ${tickets[k] ? '' : 'none'}`} title={TICKET_NAMES[k]}>
            {TICKET_ICON[k]} {TICKET_NAMES[k].replace('능력치 변경권', '능력치')} <b>{tickets[k]}</b>
          </span>
        ))}
      </div>

      <div className="barracks-actions">
        <button onClick={() => void draw()} disabled={!!mode || busy}>
          <span className="big">🎟️</span>캐릭 뽑기<small>뽑기권 {tickets.draw}</small>
        </button>
        <button className={mode?.kind === 'stat' ? 'on' : ''} onClick={() => setMode(mode?.kind === 'stat' ? null : { kind: 'stat', grade: 'statNormal' })}>
          <span className="big">🔄</span>능력치 변경<small>{tickets.statNormal + tickets.statHigh + tickets.statTop}장</small>
        </button>
        <button className={mode?.kind === 'ability' ? 'on' : ''} onClick={() => setMode(mode?.kind === 'ability' ? null : { kind: 'ability' })}>
          <span className="big">✨</span>특수능력 변경<small>{tickets.ability}장</small>
        </button>
        <button className={mode?.kind === 'merge' ? 'on' : ''} onClick={() => setMode(mode?.kind === 'merge' ? null : { kind: 'merge', ids: [] })}>
          <span className="big">🧪</span>합성<small>3·5·8·10·12명</small>
        </button>
      </div>

      {/* 지금 하는 일 안내 */}
      {mode?.kind === 'stat' && (
        <div className="mode-bar">
          <div className="seg">
            {STAT_GRADES.map((g) => (
              <button key={g} className={mode.grade === g ? 'on' : ''} onClick={() => setMode({ kind: 'stat', grade: g })}>
                {GRADE_SHORT[g]} {tickets[g]}
              </button>
            ))}
          </div>
          <span>
            바꿀 캐릭을 누르세요 · {STAT_TICKET_KEEP[mode.grade] ? `${STAT_TICKET_KEEP[mode.grade]}개 골라 유지` : '4개 모두 다시'}
          </span>
          <button onClick={() => setMode(null)}>그만</button>
        </div>
      )}
      {mode?.kind === 'ability' && (
        <div className="mode-bar">
          <span>특수능력을 바꿀 캐릭을 누르세요 (특수능력 있는 캐릭만)</span>
          <button onClick={() => setMode(null)}>그만</button>
        </div>
      )}
      {mode?.kind === 'merge' && (
        <div className="mode-bar">
          <span>
            합성할 캐릭을 누르세요 · <b>{mergeIds.length}명</b> → {mergeOk ? <b>{mergeIds.length === 3 ? '능력치 변경권(보통) (1% 최상급 · 5% 상급)' : TICKET_NAMES[mergeOk]}</b> : <span className="dim">{MERGE_COUNTS.join('·')}명만 가능</span>}
          </span>
          <button className="primary inline" disabled={!mergeOk} onClick={() => setPopup({ kind: 'mergeConfirm', ids: mergeIds })}>
            합성하기
          </button>
          <button onClick={() => setMode(null)}>그만</button>
        </div>
      )}

      <h3>
        막사 ({units.length} / {cfg.rosterSize}명)
      </h3>
      <RosterTools view={props.view} onChange={props.onView} shown={shown.length} total={units.length} />
      <ul className={`roster ${mode ? 'picking' : ''}`}>
        {shown.map((u) => (
          <UnitRow
            key={u.id}
            u={u}
            cfg={cfg}
            selected={mergeIds.includes(u.id)}
            dim={mode?.kind === 'ability' && !u.ability}
            onClick={mode ? () => onUnitClick(u) : undefined}
          />
        ))}
      </ul>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => void props.api.dev?.grantTickets(5).then((a) => props.onAccount(a))}>
          🧪 시험용: 권 모두 +5
        </button>
        <button onClick={() => confirm('막사 캐릭을 모두 새로 뽑을까요? (배치도 지워짐)') && props.onReroll()}>🎲 시험용: 막사 전체 다시 뽑기</button>
      </div>

      {popup && <BarracksPopup popup={popup} cfg={cfg} units={units} onClose={() => setPopup(null)} onStat={doStat} onAbility={doAbility} onMerge={doMerge} setPopup={setPopup} />}
    </section>
  )
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function BarracksPopup(props: {
  popup: NonNullable<Popup>
  cfg: DefenseConfig
  units: UnitInstance[]
  onClose: () => void
  onStat: (g: StatGrade, u: UnitInstance, keep: StatKey[]) => Promise<void>
  onAbility: (u: UnitInstance) => Promise<void>
  onMerge: (ids: string[]) => Promise<void>
  setPopup: (p: Popup) => void
}) {
  const { popup: pp, cfg, onClose } = props
  const one = (u: UnitInstance) => (
    <ul className="roster">
      <UnitRow u={u} cfg={cfg} />
    </ul>
  )
  switch (pp.kind) {
    case 'drawn':
      return (
        <Modal title="새 캐릭이 왔어요!" onClose={onClose}>
          {one(pp.unit)}
          <div className="row end">
            <button className="primary inline" onClick={onClose}>
              확인
            </button>
          </div>
        </Modal>
      )
    case 'statPick': {
      const need = STAT_TICKET_KEEP[pp.grade]
      const toggle = (k: StatKey) =>
        props.setPopup({ ...pp, keep: pp.keep.includes(k) ? pp.keep.filter((x) => x !== k) : pp.keep.length < need ? [...pp.keep, k] : pp.keep })
      return (
        <Modal title={`${TICKET_NAMES[pp.grade]} 쓰기`} onClose={onClose}>
          {one(pp.unit)}
          {need > 0 ? (
            <>
              <p className="dim">유지할 능력치 {need}개를 고르세요 ({pp.keep.length} / {need})</p>
              <div className="chips keep">
                {STAT_KEYS.map((k) => (
                  <button key={k} className={pp.keep.includes(k) ? 'on' : ''} onClick={() => toggle(k)}>
                    {STAT_KEY_NAMES[k]} {pp.unit[k]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="dim">공격력·사거리·공속·민첩을 모두 다시 뽑아요. 특수능력은 그대로 (없으면 5% 확률로 생김)</p>
          )}
          <div className="row end">
            <button onClick={onClose}>취소</button>
            <button className="primary inline" disabled={pp.keep.length !== need} onClick={() => void props.onStat(pp.grade, pp.unit, pp.keep)}>
              바꾸기
            </button>
          </div>
        </Modal>
      )
    }
    case 'abilityPick':
      return (
        <Modal title="특수능력 변경권 쓰기" onClose={onClose}>
          {one(pp.unit)}
          <p className="dim">특수능력만 다시 뽑아요 (종류·수치 모두 새로, 없어지지 않음)</p>
          <div className="row end">
            <button onClick={onClose}>취소</button>
            <button className="primary inline" onClick={() => void props.onAbility(pp.unit)}>
              바꾸기
            </button>
          </div>
        </Modal>
      )
    case 'changed':
      return (
        <Modal title={pp.title} onClose={onClose}>
          <p className="dim">전</p>
          {one(pp.before)}
          <p className="dim">후</p>
          {one(pp.after)}
          {pp.note && <p className="lucky">{pp.note}</p>}
          <div className="row end">
            <button className="primary inline" onClick={onClose}>
              확인
            </button>
          </div>
        </Modal>
      )
    case 'mergeConfirm': {
      const list = props.units.filter((u) => pp.ids.includes(u.id))
      // 아까운 캐릭(파랑 이상 · 특수능력 있음)이 섞였으면 한 번 더 알려 줌
      const precious = list.filter((u) => statTier(cfg, u).tier >= 4 || u.ability)
      const reward = MERGE_TABLE[pp.ids.length]!
      return (
        <Modal title={`${list.length}명 합성`} onClose={onClose}>
          <p>
            받는 것: <b>{pp.ids.length === 3 ? '능력치 변경권(보통) — 1% 최상급 · 5% 상급' : TICKET_NAMES[reward]}</b>
          </p>
          {precious.length > 0 && <p className="warn">⚠ 좋은 캐릭 {precious.length}명이 들어 있어요 (파랑 이상이거나 특수능력 있음). 합성하면 사라져요</p>}
          <ul className="roster small">
            {list.map((u) => (
              <UnitRow key={u.id} u={u} cfg={cfg} />
            ))}
          </ul>
          <div className="row end">
            <button onClick={onClose}>취소</button>
            <button className="primary inline" onClick={() => void props.onMerge(pp.ids)}>
              합성하기
            </button>
          </div>
        </Modal>
      )
    }
    case 'merged':
      return (
        <Modal title="합성 완료" onClose={onClose}>
          <p className="big-reward">
            {TICKET_ICON[pp.reward]} {TICKET_NAMES[pp.reward]} +1
          </p>
          {pp.count === 3 && pp.reward !== 'statNormal' && <p className="lucky">✨ 행운! 보통 대신 {GRADE_SHORT[pp.reward as StatGrade]}이 나왔어요</p>}
          <div className="row end">
            <button className="primary inline" onClick={onClose}>
              확인
            </button>
          </div>
        </Modal>
      )
  }
}
