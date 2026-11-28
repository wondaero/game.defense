import { showAlert } from './dialog.tsx'
import { Icon, type IconName } from './Icon.tsx'
import { useState, type ReactNode } from 'react'
import {
  MERGE_COST,
  STAT_KEY_NAMES,
  STAT_KEYS,
  STAT_TICKET_KEEP,
  baseStats,
  statScore,
  statTier,
  STAT_TIERS,
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
import { AbBox, AbilityDesc, RosterTools, UnitFace, UnitRow, viewRoster, type RosterView } from './UnitList.tsx'
import { abilityText, unitLook } from './format.ts'
import type { GameApi } from './api/api.ts'
import { AbilityRolls } from './abilityRolls.tsx'

/**
 * 막사: 캐릭 목록 + 캐릭 뽑기 · 합성 (메인) / 능력치 변경 · 특수능력 변경 (캐릭을 누르면 뜨는 창, 2026-11-28).
 * 화면은 계정을 직접 고치지 않고 api.barracks(요청)만 보냄 → 검사·난수·저장은 api 쪽(지금 localApi, 나중에 서버)
 */
/** 합성 모드: 만들 권(target)을 고른 뒤 캐릭 고르기 (2026-11-28) */
type Mode = null | { kind: 'merge'; target: TicketKind; ids: string[] }
type Popup =
  | null
  | { kind: 'drawn'; unit: UnitInstance }
  | { kind: 'drawnMany'; units: UnitInstance[] }
  /** 캐릭 자세히 + 능력치 변경 · 특수능력 변경 (아래에서 올라오는 창) — 2026-11-28 */
  | { kind: 'unit'; unitId: string }
  /** 능력치 변경: 등급 고르기 (보통 · 상급 · 최상급) */
  | { kind: 'gradePick'; unitId: string }
  | { kind: 'statPick'; grade: StatGrade; unit: UnitInstance; keep: StatKey[] }
  | { kind: 'abilityPick'; unit: UnitInstance }
  /** 결과 창. redo = 같은 캐릭에 같은 권으로 바로 다시 (2026-11-28) */
  | { kind: 'changed'; title: string; before: UnitInstance; after: UnitInstance; note?: string; redo: Redo }
  /** 합성: 만들 권 고르기 */
  | { kind: 'mergePick' }
  | { kind: 'mergeConfirm'; target: TicketKind; ids: string[] }
  | { kind: 'merged'; count: number; target: TicketKind; rewards: TicketKind[] }

type Redo = { type: 'stat'; grade: StatGrade; keep: StatKey[] } | { type: 'ability' }
const STAT_GRADES: StatGrade[] = ['statNormal', 'statHigh', 'statTop']
const GRADE_SHORT: Record<StatGrade, string> = { statNormal: '보통', statHigh: '상급', statTop: '최상급' }
/** 배지 숫자: 9999 까지 그대로, 넘으면 9999+ (2026-11-28) */
const badgeText = (n: number) => (n > 9999 ? '9999+' : String(n))
/** 권 아이콘 (합성 결과 창) */
const TICKET_ICON: Record<TicketKind, IconName> = { draw: 'ticket', statNormal: 'rerollBronze', statHigh: 'rerollSilver', statTop: 'rerollGold', ability: 'sparkle', abilityGrant: 'gift' }

export function Barracks(props: {
  cfg: DefenseConfig
  account: Account
  api: GameApi
  /** removedIds = 합성으로 없어진 캐릭 (배치에서도 빼야 함) */
  onAccount: (next: Account, removedIds?: string[]) => void
  view: RosterView
  onView: (v: RosterView) => void
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
      void showAlert(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  const draw = async () => {
    const o = await send({ type: 'draw' })
    if (o?.type === 'drawn') setPopup({ kind: 'drawn', unit: o.unit })
  }
  /** 모두 뽑기: 남은 뽑기 티켓을 한 번에 → 뽑힌 캐릭 목록 (점수 높은 순) */
  const drawAll = async () => {
    const o = await send({ type: 'drawAll' })
    if (o?.type === 'drawnMany') setPopup({ kind: 'drawnMany', units: o.units })
  }

  /** 캐릭 누르기: 합성 중이면 고르기, 아니면 자세히 창 */
  const onUnitClick = (u: UnitInstance) => {
    // 빠르게 연달아 눌러도 빠짐없이 (이전 상태 기준으로 갱신)
    if (mode?.kind === 'merge') setMode((m) => (m?.kind === 'merge' ? { ...m, ids: m.ids.includes(u.id) ? m.ids.filter((x) => x !== u.id) : [...m.ids, u.id] } : m))
    else setPopup({ kind: 'unit', unitId: u.id })
  }

  const doStat = async (grade: StatGrade, unit: UnitInstance, keep: StatKey[]) => {
    const o = await send({ type: 'rerollStats', unitId: unit.id, grade, keep })
    if (o?.type === 'changed') setPopup({ kind: 'changed', title: `${TICKET_NAMES[grade]} 사용`, before: o.before, after: o.after, note: o.gainedAbility ? '특수능력이 생겼어요! (5% 행운)' : undefined, redo: { type: 'stat', grade, keep } })
    else setPopup(null)
  }
  const doAbility = async (unit: UnitInstance) => {
    const o = await send({ type: 'rerollAbility', unitId: unit.id })
    if (o?.type === 'changed') setPopup({ kind: 'changed', title: '특수능력 변경 티켓 사용', before: o.before, after: o.after, redo: { type: 'ability' } })
    else setPopup(null)
  }
  const doGrant = async (unit: UnitInstance) => {
    const o = await send({ type: 'grantAbility', unitId: unit.id })
    if (o?.type === 'changed') setPopup({ kind: 'changed', title: '특수능력 부여 티켓 사용', before: o.before, after: o.after, note: '특수능력이 생겼어요!', redo: { type: 'ability' } })
    else setPopup(null)
  }
  const doMerge = async (target: TicketKind, ids: string[]) => {
    const o = await send({ type: 'merge', unitIds: ids, target })
    if (o?.type === 'merged') {
      setMode(null)
      setPopup({ kind: 'merged', count: o.count, target: o.target, rewards: o.rewards })
    } else setPopup(null)
  }

  const mergeIds = mode?.kind === 'merge' ? mode.ids : []
  const mergeCost = mode?.kind === 'merge' ? MERGE_COST[mode.target] : 0
  const mergeOk = mergeCost > 0 && mergeIds.length >= mergeCost && mergeIds.length % mergeCost === 0

  return (
    <section className="barracks-page">
      {/* 위쪽 고정: 버튼 · 권 현황 · 안내 띠 · 제목 · 보기/정렬 — 스크롤해도 붙어 있고 캐릭 목록만 움직임 */}
      <div className="barracks-sticky">
        {/* 메인 버튼 2개 (2026-11-28): 캐릭 뽑기 · 합성. 능력치·특수능력 변경은 캐릭을 누르면 */}
        <div className="barracks-actions two">
          <button title="병사 뽑기" className={`act draw ${tickets.draw ? '' : 'empty'}`} onClick={() => void draw()} disabled={!!mode || busy}>
            <span className="big">
              <Icon name="ticket" />
            </span>
            <span className="label">병사 뽑기</span>
            {tickets.draw > 0 && <b className="badge">{badgeText(tickets.draw)}</b>}
          </button>
          <button title="병사 합성" className={`act merge ${mode?.kind === 'merge' ? 'on' : ''}`} onClick={() => (mode?.kind === 'merge' ? setMode(null) : setPopup({ kind: 'mergePick' }))}>
            <span className="big">
              <Icon name="flask" />
            </span>
            <span className="label">합성</span>
          </button>
        </div>
        {/* 가진 티켓 한 줄 = 아이콘 + 장 수 (2026-11-29): 능력치 변경 보통 동 · 상급 은 · 최상급 금 · 특수능력 변경 · 부여. 0장은 흐리게, 이름은 길게 누르면(title) */}
        <div className="ticket-line icons">
          {(['statNormal', 'statHigh', 'statTop', 'ability', 'abilityGrant'] as TicketKind[]).map((k) => (
            <span key={k} className={tickets[k] ? '' : 'zero'} title={`${TICKET_NAMES[k].replace('\u00a0', ' ')} ${tickets[k]}장`}>
              <Icon name={TICKET_ICON[k]} /> <b>{tickets[k]}</b>
            </span>
          ))}
        </div>

        {mode?.kind === 'merge' && (
          <div className="mode-bar">
            {/* 계산: n명 → 몇 장 + (남는 사람 / 단위) — 2026-11-28 */}
            {(() => {
              const n = mergeIds.length
              const full = Math.floor(n / mergeCost)
              const rem = n % mergeCost
              return (
                <div className="merge-calc">
                  <div className="mc-what">
                    <b>{TICKET_NAMES[mode.target]}</b> · {mergeCost}명에 1장
                  </div>
                  <div className="mc-count">
                    {n}명 → <b>{full}장</b>
                    {rem > 0 && (
                      <span className="mc-rem">
                        {' '}
                        + ({rem}/{mergeCost})
                      </span>
                    )}
                    {rem === 0 && full > 0 && <span className="mc-ok"> ✓</span>}
                  </div>
                  {rem > 0 && (
                    <div className="mc-hint">
                      {mergeCost - rem}명 더 고르면 {full + 1}장{full > 0 ? ` · 또는 ${rem}명 빼면 ${full}장` : ''} — 딱 맞아야 합성돼요
                    </div>
                  )}
                  {n === 0 && <div className="mc-hint">합성할 병사를 누르세요</div>}
                </div>
              )
            })()}
            <button onClick={() => setPopup({ kind: 'mergePick' })}>티켓 변경</button>
            <button className="primary inline" disabled={!mergeOk} onClick={() => setPopup({ kind: 'mergeConfirm', target: mode.target, ids: mergeIds })}>
              합성하기
            </button>
            <button onClick={() => setMode(null)}>취소</button>
          </div>
        )}

        {/* 인원 · 보기 · 정렬 한 줄 (2026-11-28, "막사 (n/100명)" 제목 줄 대신) */}
        <RosterTools view={props.view} onChange={props.onView} roster={units} lead={<><b>{units.length}</b> / {cfg.rosterSize}</>} />
      </div>
      {units.length === 0 && <p className="empty-note">
          아직 병사가 없어요.
          <br />위 <b>병사 뽑기</b>로 첫 병사를 뽑아 보세요!
        </p>}
      <ul className="roster picking">
        {shown.map((u) => (
          <UnitRow key={u.id} u={u} cfg={cfg} selected={mergeIds.includes(u.id)} onClick={() => onUnitClick(u)} />
        ))}
      </ul>

      {popup && <BarracksPopup popup={popup} cfg={cfg} units={units} tickets={tickets} onClose={() => setPopup(null)} onStat={doStat} onAbility={doAbility} onGrant={doGrant} onDrawAll={drawAll} onMerge={doMerge} onMergeTarget={(target) => {
            setMode({ kind: 'merge', target, ids: mode?.kind === 'merge' ? mode.ids : [] })
            setPopup(null)
          }} setPopup={setPopup} />}
    </section>
  )
}

/**
 * 팝업 위치 규칙 (2026-11-28):
 * 기준 하나: "이 창에서 같은 캐릭에 대해 다음 행동을 할 수 있는가?"
 * - 있으면 sheet(아래에서 올라옴): 캐릭 창 · 등급 고르기 · 유지 고르기 · 특수능력 변경 확인 · 변경 결과(다시 바꾸기)
 * - 없으면 가운데: 확인만 누르는 결과(뽑기 · 합성 · 탄 결과)와 경고 확인(합성 확인 · 진행 중 탄 나가기 · 초기화)
 */
function Modal({ title, children, onClose, sheet }: { title: string; children: ReactNode; onClose: () => void; sheet?: boolean }) {
  return (
    <div className={`modal-back ${sheet ? 'sheet' : ''}`} onClick={onClose}>
      <div className={`modal ${sheet ? 'sheet' : ''}`} onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  )
}

/** 캐릭 자세히 (창 위쪽): 큰 얼굴 · 이름 · 등급·점수 · 능력치 4개(뜻 포함) · 특수능력 전체 설명 */
/** keep: 능력치 변경(상급·최상급)에서 유지할 능력치를 능력치 줄 체크로 고를 때 (2026-11-28) */
function UnitDetail({ u, cfg, keep }: { u: UnitInstance; cfg: DefenseConfig; keep?: { picked: StatKey[]; need: number; onToggle: (k: StatKey) => void } }) {
  const look = unitLook(cfg, u)
  const b = baseStats(cfg, u)
  const ab = abilityText(u)
  /** 능력치 한 줄 = 이름 · 값 · 최소 ━━●━━ 최대 막대 (2026-11-28). 특수능력으로 올라간 값은 ▲ (막대 끝을 넘으면 끝에 붙음) */
  const row = (key: StatKey, label: string, now: number, orig: number, unit: string, min: number, max: number) => {
    const pos = (v: number) => Math.max(0, Math.min(100, ((v - min) / Math.max(1, max - min)) * 100))
    const on = !!keep?.picked.includes(key)
    const full = !!keep && keep.picked.length >= keep.need
    return (
      <li
        className={keep ? `pickable ${on ? 'keep-on' : ''} ${!on && full ? 'keep-off' : ''}` : ''}
        onClick={keep ? () => keep.onToggle(key) : undefined}
        role={keep ? 'checkbox' : undefined}
        aria-checked={keep ? on : undefined}
      >
        {keep && <span className={`keep-box ${on ? 'on' : ''}`}>{on ? '✓' : ''}</span>}
        <span className="k">{label}</span>
        <span className="v">
          <b className={now !== orig ? 'up' : ''}>{now}</b>
          {unit}
          {now !== orig && <small className="up">▲</small>}
        </span>
        <span className="sbar">
          <i>{min}</i>
          <span className="track">
            {/* 손잡이가 막대 끝에서 반쯤 삐져나가 숫자에 붙지 않게, 손잡이 중심이 움직이는 길이 = 막대 − 손잡이 폭 */}
            <span className="fill" style={{ width: `calc(7px + (100% - 14px) * ${pos(now) / 100})` }} />
            <span className={`knob ${now !== orig ? 'up' : ''}`} style={{ left: `calc(7px + (100% - 14px) * ${pos(now) / 100})` }} />
          </span>
          <i>{max}</i>
        </span>
      </li>
    )
  }
  const score = statScore(cfg, u)
  return (
    <div className="unit-detail">
      <div className="ud-head">
        <UnitFace body={look.body} tool={look.tool} rainbow={look.tier === 6} big />
        <div className="ud-title">
          <b className={`tier-pill t${look.tier} ${look.special === 'trainee' ? 'trainee' : ''}`}>{look.title}</b>
          {/* 등급 사다리 (2026-11-28): 흰 - 노랑 - 초록 - 파랑 - 보라 - 무지개, 내 등급만 크게 */}
          <div className="tier-ladder" aria-label={`${look.tierName} 등급`}>
            {STAT_TIERS.map((t, i) => (
              <span key={t.tier} className={`tl-step ${t.tier === look.tier ? 'me' : ''} ${t.tier < look.tier ? 'past' : ''}`}>
                {i > 0 && <i className="tl-line" />}
                <b className={`tl-dot t${t.tier}`} title={`${t.name} (${t.min}점~)`} />
              </span>
            ))}
          </div>
          <div className="dim ud-score">{score}점</div>
        </div>
      </div>
      <ul className={`ud-stats tier-t${look.tier} ${keep ? 'picking' : ''}`}>
        {row('atk', '공격력', b.atk, u.atk, '', cfg.atk.min, cfg.atk.max)}
        {row('range', '사거리', b.range, u.range, '칸', cfg.range.min, cfg.range.max)}
        {row('attackSpeed', '공속', b.attackSpeed, u.attackSpeed, '', cfg.attackSpeed.min, cfg.attackSpeed.max)}
        {row('agility', '민첩', b.agility, u.agility, '', cfg.agility.min, cfg.agility.max)}
      </ul>
      {ab && u.ability ? (
        <div className="ab2 big">
          <b className="ab2-title">
            특수능력: <span>{ab.name}</span>
          </b>
          {/* 뽑을 수 있는 값 전부 + 이 캐릭이 뽑은 값 강조 (2026-11-28) */}
          <AbBox>
            <AbilityRolls ability={u.ability} />
          </AbBox>
        </div>
      ) : (
        <p className="dim">특수능력 없음 — 부여 티켓으로 붙이거나, 능력치 변경 때 5% 확률로 생겨요</p>
      )}
    </div>
  )
}

/** 모두 뽑기 결과 (2026-11-29): 막사와 같은 보기(능력 있음/없음) · 정렬로 목록, 창 안에서만 스크롤 */
function DrawnMany({ units, cfg, onClose }: { units: UnitInstance[]; cfg: DefenseConfig; onClose: () => void }) {
  const [view, setView] = useState<RosterView>({ filter: 'all', sort: 'score' })
  // 목록에서 누른 캐릭 → 캐릭 자세히 모양(등급 사다리·막대)으로, "‹ 목록" 으로 돌아옴 (2026-11-29)
  const [pick, setPick] = useState<UnitInstance | null>(null)
  const list = viewRoster(cfg, units, view)
  if (pick)
    return (
      <Modal title="" onClose={onClose}>
        <div className="drawn-back">
          <button className="back-btn" onClick={() => setPick(null)}>
            <Icon name="back" size="1em" />
            목록
          </button>
        </div>
        <div className="drawn-detail">
          <UnitDetail u={pick} cfg={cfg} />
        </div>
        <div className="row end">
          <button className="primary inline" onClick={onClose}>
            확인
          </button>
        </div>
      </Modal>
    )
  return (
    <Modal title={`${units.length}명이 왔어요!`} onClose={onClose}>
      <div className="drawn-tools">
        <RosterTools view={view} onChange={setView} roster={units} />
      </div>
      <ul className="roster drawn-list">
        {list.map((u) => (
          <UnitRow key={u.id} u={u} cfg={cfg} stacked onClick={() => setPick(u)} />
        ))}
        {list.length === 0 && <p className="dim">해당하는 병사가 없어요.</p>}
      </ul>
      <div className="row end">
        <button className="primary inline" onClick={onClose}>
          확인
        </button>
      </div>
    </Modal>
  )
}

function BarracksPopup(props: {
  popup: NonNullable<Popup>
  cfg: DefenseConfig
  units: UnitInstance[]
  tickets: Account['tickets']
  onClose: () => void
  onStat: (g: StatGrade, u: UnitInstance, keep: StatKey[]) => Promise<void>
  onAbility: (u: UnitInstance) => Promise<void>
  onGrant: (u: UnitInstance) => Promise<void>
  onDrawAll: () => Promise<void>
  onMerge: (target: TicketKind, ids: string[]) => Promise<void>
  onMergeTarget: (target: TicketKind) => void
  setPopup: (p: Popup) => void
}) {
  const { popup: pp, cfg, onClose } = props
  const one = (u: UnitInstance) => (
    <ul className="roster">
      {/* 창이 좁아 능력치를 얼굴 아래 줄 폭 전체로 (2026-11-29) */}
      <UnitRow u={u} cfg={cfg} stacked />
    </ul>
  )
  switch (pp.kind) {
    case 'unit': {
      const u = props.units.find((x) => x.id === pp.unitId)
      if (!u) return null
      return (
        <Modal title="" onClose={onClose} sheet>
          <button className="sheet-close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
          <UnitDetail u={u} cfg={cfg} />
          {/* 바로 쓰기 4개 (2026-11-28): 능력치 변경 보통·상급·최상급 · 특수능력 변경 — 등급 고르는 단계 없이 바로 */}
          <div className="ud-actions four">
            {STAT_GRADES.map((g) => (
              <button key={g} className={`act stat grade-${g}`} disabled={props.tickets[g] < 1} onClick={() => props.setPopup({ kind: 'statPick', grade: g, unit: u, keep: [] })}>
                <span className="a-main">
                  <Icon name={TICKET_ICON[g]} /> 능력치 변경
                </span>
                <span className="a-sub">
                  {GRADE_SHORT[g]}
                  {STAT_TICKET_KEEP[g] ? ` · ${STAT_TICKET_KEEP[g]}개 유지` : ' · 모두 다시'}
                </span>
                {props.tickets[g] > 0 && <b className="badge">{badgeText(props.tickets[g])}</b>}
              </button>
            ))}
            {/* 4번째 칸: 특수능력 있으면 "변경", 없으면 "부여" (2026-11-28) */}
            {u.ability ? (
              <button className="act ability" disabled={props.tickets.ability < 1} onClick={() => props.setPopup({ kind: 'abilityPick', unit: u })}>
                <span className="a-main">
                  <Icon name="sparkle" /> 특수능력 변경
                </span>
                <span className="a-sub">종류·수치 다시</span>
                {props.tickets.ability > 0 && <b className="badge">{badgeText(props.tickets.ability)}</b>}
              </button>
            ) : (
              <button className="act grant" disabled={props.tickets.abilityGrant < 1} onClick={() => props.setPopup({ kind: 'abilityPick', unit: u })}>
                <span className="a-main">
                  <Icon name="gift" /> 특수능력 부여
                </span>
                <span className="a-sub">하나 붙이기</span>
                {props.tickets.abilityGrant > 0 && <b className="badge">{badgeText(props.tickets.abilityGrant)}</b>}
              </button>
            )}
          </div>
        </Modal>
      )
    }
    case 'gradePick': {
      const u = props.units.find((x) => x.id === pp.unitId)
      if (!u) return null
      return (
        <Modal title="" onClose={onClose} sheet>
          <button className="sheet-close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
          <UnitDetail u={u} cfg={cfg} />
          <h4 className="sheet-step">능력치 변경 티켓 — 어떤 걸 쓸까요?</h4>
          <div className="grade-pick">
            {STAT_GRADES.map((g) => {
              const keep = STAT_TICKET_KEEP[g]
              const n = props.tickets[g]
              return (
                <button key={g} disabled={n < 1} onClick={() => props.setPopup({ kind: 'statPick', grade: g, unit: u, keep: [] })}>
                  <b>{GRADE_SHORT[g]}</b>
                  <span>{keep ? `${keep}개 골라 유지, 나머지 다시` : '4개 모두 다시'}</span>
                  <em>{n}장</em>
                </button>
              )
            })}
          </div>
          <div className="row end">
            <button onClick={() => props.setPopup({ kind: 'unit', unitId: u.id })}>뒤로</button>
          </div>
        </Modal>
      )
    }
    case 'drawn':
      return (
        <Modal title="새 병사가 왔어요!" onClose={onClose}>
          {/* 캐릭 자세히와 같은 모양: 등급 사다리 · 능력치 막대 · 특수능력 (2026-11-29) */}
          <div className="drawn-detail">
            <UnitDetail u={pp.unit} cfg={cfg} />
          </div>
          <div className="row end">
            {/* 뽑기 티켓이 더 있으면 남은 것 한 번에 (2026-11-29) */}
            {/* 한 번에 뽑을 수 = 남은 티켓과 막사 빈자리 중 작은 것 (2026-11-29) */}
            {(() => {
              const n = Math.min(props.tickets.draw, cfg.rosterSize - props.units.length)
              return n > 0 ? (
                <button onClick={() => void props.onDrawAll()}>
                  <Icon name="ticket" /> {n}명 한 번에 뽑기
                </button>
              ) : null
            })()}
            <button className="primary inline" onClick={onClose}>
              확인
            </button>
          </div>
        </Modal>
      )
    case 'drawnMany':
      return <DrawnMany units={pp.units} cfg={cfg} onClose={onClose} />
    case 'statPick': {
      const need = STAT_TICKET_KEEP[pp.grade]
      const toggle = (k: StatKey) => props.setPopup({ ...pp, keep: pp.keep.includes(k) ? pp.keep.filter((x) => x !== k) : pp.keep.length < need ? [...pp.keep, k] : pp.keep })
      return (
        <Modal title="" onClose={onClose} sheet>
          <button className="sheet-close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
          <UnitDetail u={pp.unit} cfg={cfg} keep={need > 0 ? { picked: pp.keep, need, onToggle: toggle } : undefined} />
          <h4 className="sheet-step">{TICKET_NAMES[pp.grade]} 쓰기</h4>
          {need > 0 ? (
            <p className="dim keep-hint">
              유지할 능력치 {need}개를 <b>위에서 체크</b>하세요 <b className="keep-count">{pp.keep.length} / {need}</b>
            </p>
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
        <Modal title="" onClose={onClose} sheet>
          <button className="sheet-close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
          <UnitDetail u={pp.unit} cfg={cfg} />
          {pp.unit.ability ? (
            <>
              <h4 className="sheet-step">특수능력 변경 티켓 쓰기</h4>
              <p className="dim">
                특수능력만 다시 뽑아요
                <br />
                종류·수치 모두 새로 뽑고, 특수능력이 없어지지는 않아요
              </p>
            </>
          ) : (
            <>
              <h4 className="sheet-step">특수능력 부여 티켓 쓰기</h4>
              <p className="dim">
                이 병사에 특수능력을 하나 붙여요
                <br />
                종류·수치는 무작위 (능력치는 그대로)
              </p>
            </>
          )}
          <div className="row end">
            <button onClick={onClose}>취소</button>
            <button className="primary inline" onClick={() => void (pp.unit.ability ? props.onAbility(pp.unit) : props.onGrant(pp.unit))}>
              {pp.unit.ability ? '바꾸기' : '붙이기'}
            </button>
          </div>
        </Modal>
      )
    case 'changed': {
      // 다시 바꾸기: 같은 캐릭에 같은 권(능력치는 같은 등급 · 같은 유지)으로 바로
      const r = pp.redo
      const left = r.type === 'stat' ? props.tickets[r.grade] : props.tickets.ability
      const redo = () => void (r.type === 'stat' ? props.onStat(r.grade, pp.after, r.keep) : props.onAbility(pp.after))
      const keepText = r.type === 'stat' && r.keep.length ? `${r.keep.map((k) => STAT_KEY_NAMES[k]).join('·')} 유지` : ''
      return (
        <Modal title="" onClose={onClose} sheet>
          <button className="sheet-close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
          <h4 className="sheet-title">{pp.title}</h4>
          <ChangeDiff before={pp.before} after={pp.after} cfg={cfg} />
          {pp.note && (
            <p className="lucky">
              <Icon name="sparkle" /> {pp.note}
            </p>
          )}
          <div className="redo-row">
            <button className={`act ${r.type === 'stat' ? 'stat' : 'ability'}`} disabled={left < 1} onClick={redo}>
              <span>
                <Icon name={r.type === 'stat' ? 'reroll' : 'sparkle'} /> {left < 1 ? '변경 티켓 없음' : '다시 바꾸기'}
              </span>
              {left > 0 && keepText && <small className="redo-keep">{keepText}</small>}
              {left > 0 && <b className="badge">{badgeText(left)}</b>}
            </button>
            <button className="primary inline" onClick={onClose}>
              확인
            </button>
          </div>
        </Modal>
      )
    }
    case 'mergePick':
      // 합성: 만들 권 먼저 고르기 (2026-11-28) — 이어서 캐릭을 고르는 작업이라 아래 창
      return (
        <Modal title="" onClose={onClose} sheet>
          <button className="sheet-close" aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
          <h4 className="sheet-title">무엇을 만들까요?</h4>
          <p className="dim" style={{ margin: '0 0 8px' }}>
            고른 티켓의 인원 단위로 병사를 넣어요. 예) 보통 3명 단위 → 12명이면 4장
          </p>
          <div className="grade-pick merge-pick">
            {(['statNormal', 'draw', 'statHigh', 'ability', 'statTop', 'abilityGrant'] as TicketKind[]).map((k) => (
              <button key={k} disabled={props.units.length < MERGE_COST[k]} onClick={() => props.onMergeTarget(k)}>
                <b>
                  <Icon name={TICKET_ICON[k]} />
                </b>
                <span>
                  {TICKET_NAMES[k]}
                  {k === 'statNormal' && <small className="dim merge-note">가끔 1%{'\u00a0'}최상급 · 5%{'\u00a0'}상급</small>}
                </span>
                <em>{MERGE_COST[k]}명</em>
              </button>
            ))}
          </div>
        </Modal>
      )
    case 'mergeConfirm': {
      const list = props.units.filter((u) => pp.ids.includes(u.id))
      // 아까운 캐릭(파랑 이상 · 특수능력 있음)이 섞였으면 한 번 더 알려 줌
      const precious = list.filter((u) => statTier(cfg, u).tier >= 4 || u.ability)
      const n = pp.ids.length / MERGE_COST[pp.target]
      return (
        <Modal title={`${list.length}명 합성`} onClose={onClose}>
          <p>
            받는 것: <b>
              {TICKET_NAMES[pp.target]} {n}장
            </b>
            {pp.target === 'statNormal' && <span className="dim"> (장마다 1% 최상급 · 5% 상급)</span>}
          </p>
          {precious.length > 0 && <p className="warn">
              <Icon name="warn" /> 좋은 병사 {precious.length}명이 들어 있어요 (파랑 이상이거나 특수능력 있음). 합성하면 사라져요</p>}
          <ul className="roster small">
            {list.map((u) => (
              <UnitRow key={u.id} u={u} cfg={cfg} />
            ))}
          </ul>
          <div className="row end">
            <button onClick={onClose}>취소</button>
            <button className="primary inline" onClick={() => void props.onMerge(pp.target, pp.ids)}>
              합성하기
            </button>
          </div>
        </Modal>
      )
    }
    case 'merged': {
      // 받은 권 모아 세기 (보통 합성은 행운으로 상급·최상급이 섞일 수 있음)
      const got = new Map<TicketKind, number>()
      for (const k of pp.rewards) got.set(k, (got.get(k) ?? 0) + 1)
      const lucky = pp.target === 'statNormal' ? pp.rewards.filter((k) => k !== 'statNormal').length : 0
      return (
        <Modal title="합성 완료" onClose={onClose}>
          {[...got].map(([k, c]) => (
            <p key={k} className="big-reward">
              <Icon name={TICKET_ICON[k]} /> {TICKET_NAMES[k]} +{c}
            </p>
          ))}
          {lucky > 0 && <p className="lucky">
              <Icon name="sparkle" /> 행운! {lucky}장이 보통 대신 상급 이상으로 나왔어요</p>}
          <div className="row end">
            <button className="primary inline" onClick={onClose}>
              확인
            </button>
          </div>
        </Modal>
      )
    }
  }
}

/**
 * 변경 결과 (2026-11-28): 전/후를 통째로 두 번 보여 주지 않고 바뀐 것만 — 주식처럼 오르면 빨강 ▲ · 내리면 파랑 ▼ · 그대로 회색 –
 */
function ChangeDiff({ before, after, cfg }: { before: UnitInstance; after: UnitInstance; cfg: DefenseConfig }) {
  const lb = unitLook(cfg, before)
  const la = unitLook(cfg, after)
  const bb = baseStats(cfg, before)
  const ba = baseStats(cfg, after)
  const delta = (d: number) => {
    const v = Math.round(d * 10) / 10
    return v > 0 ? <em className="up">▲{v}</em> : v < 0 ? <em className="down">▼{-v}</em> : <em className="same">–</em>
  }
  const line = (label: string, from: number, to: number, unit = '') => (
    <li key={label}>
      <span className="k">{label}</span>
      <span className="v">
        {from}
        {unit} → <b>{to}</b>
        {unit}
      </span>
      {delta(to - from)}
    </li>
  )
  const pill = (look: ReturnType<typeof unitLook>) => <b className={`tier-pill t${look.tier} ${look.special === 'trainee' ? 'trainee' : ''}`}>{look.title}</b>
  const abB = abilityText(before)
  const abA = abilityText(after)
  const sameAbility = JSON.stringify(before.ability) === JSON.stringify(after.ability)
  return (
    <div className="change-diff">
      {/* 전 → 후: 이름 꼬리표 + 캐릭 그림, 양쪽 각각 가운데 정렬 */}
      <div className="cd-name">
        <div className="cd-side">
          {pill(lb)}
          <UnitFace body={lb.body} tool={lb.tool} rainbow={lb.tier === 6} big />
        </div>
        <span className="arrow">→</span>
        <div className="cd-side">
          {pill(la)}
          <UnitFace body={la.body} tool={la.tool} rainbow={la.tier === 6} big />
        </div>
      </div>
      {/* 능력치가 하나도 안 바뀌었으면(특수능력 변경) 한 줄로 */}
      {bb.atk === ba.atk && bb.range === ba.range && bb.attackSpeed === ba.attackSpeed && bb.agility === ba.agility ? (
        <p className="dim cd-same">능력치 그대로 (점수 {statScore(cfg, after)})</p>
      ) : (
        <ul className="cd-stats">
          {line('능력치 점수', statScore(cfg, before), statScore(cfg, after))}
          {line('공격력', bb.atk, ba.atk)}
          {line('사거리', bb.range, ba.range, '칸')}
          {line('공속', bb.attackSpeed, ba.attackSpeed)}
          {line('민첩', bb.agility, ba.agility)}
        </ul>
      )}
      {sameAbility ? (
        <p className="dim cd-same">{abA ? `특수능력 그대로 (${abA.name})` : '특수능력 없음'}</p>
      ) : (
        <div className="ab2 big">
          <b className="ab2-title">
            특수능력: <span>{abB ? abB.name : '없음'}</span> → <span>{abA ? abA.name : '없음'}</span>
          </b>
          {abA && (
            <AbBox>
              <AbilityDesc name={abA.name} desc={abA.desc} />
            </AbBox>
          )}
        </div>
      )}
    </div>
  )
}
