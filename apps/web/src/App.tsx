import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ABILITY_NAMES,
  createRngState,
  createWave,
  DEFAULT_CONFIG,
  LAST_NORMAL_STAGE,
  MAP_DEFS,
  MONSTER_ABILITIES,
  monsterAbilityDesc,
  parseMap,
  baseStats,
  starsFor,
  REFERENCE_MAX_STAGE,
  referenceSummary,
  stageHpBp,
  rollRoster,
  stageDef,
  stageSummary,
  stepWave,
  type Cell,
  type DefenseConfig,
  type MonsterAbilityKind,
  type MonsterSpec,
  type Placements,
  type UnitInstance,
  type WaveSim,
} from '@def/defense'
import { CELL_PX, draw, monsterScreenPos, monsterSprite, newAnimState, PAD, type Fx } from './draw.ts'
import { loadSprites, motionDuration } from './sprites.ts'
import { Bench } from './Bench.tsx'
import { ResultOverlay } from './ResultOverlay.tsx'
import { StageMap } from './StageMap.tsx'
import { abilityText, unitLook } from './format.ts'

const MAPS = MAP_DEFS.map(parseMap)
const mapById = (id: string) => MAPS.find((m) => m.id === id)!

/** 화면: 탄 고르기 → 탄 준비(출연 몬스터 보고 배치) → 진행 → 결과 */
type Screen = 'select' | 'prepare' | 'play' | 'result' | 'bench'

/** 브라우저에 저장하는 것 (시험판) */
interface Save {
  best: number
  rosterSeed: string
  placementsByMap: Record<string, Placements>
  unlockAll: boolean
  /** 탄별 가장 좋은 별 (1~3) */
  stars: Record<number, number>
}
const SAVE_KEY = 'defense.save.v1'
function loadSave(): Save {
  const empty: Save = { best: 0, rosterSeed: '시험판-1', placementsByMap: {}, unlockAll: false, stars: {} }
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Save>) } : empty
  } catch {
    return empty
  }
}

/** 몬스터 능력 효과 색 */
const MSKILL_COLOR: Record<MonsterAbilityKind, string> = {
  freeze: '#81d4fa',
  fullHeal: '#69f0ae',
  groupHeal: '#69f0ae',
  haste: '#ffab40',
  blink: '#ce93d8',
  invincible: '#ffd54f',
  scatter: '#ce93d8',
  weaken: '#b388ff',
  armorUp: '#cfd8dc',
  seal: '#90a4ae',
}

const pct = (bp: number) => `${Math.round(bp / 100)}%`
/** 뽑기 공속은 1~5 */
const clampSpeed = (v: number) => Math.min(5, Math.max(1, Math.round(v)))

export function App() {
  const [cfg, setCfg] = useState<DefenseConfig>({ ...DEFAULT_CONFIG })
  const [save, setSave] = useState<Save>(loadSave)
  const [screen, setScreen] = useState<Screen>('select')
  const [stageNo, setStageNo] = useState(1)
  const [result, setResult] = useState<{ cleared: boolean; text: string; stars: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  /** 진행 중 뒤로 가기를 눌렀을 때 묻는 창 (wasPaused = 창을 띄우기 전 일시정지였나) */
  const [askLeave, setAskLeave] = useState<{ wasPaused: boolean } | null>(null)
  /** 화면 버튼으로 탄 고르기에 돌아가는 중 (history.back 뒤 popstate 에서 묻지 않고 이동) */
  const leavingRef = useRef(false)
  const [showSettings, setShowSettings] = useState(false)
  const [, setUiTick] = useState(0)

  useEffect(() => localStorage.setItem(SAVE_KEY, JSON.stringify(save)), [save])
  useEffect(() => {
    void loadSprites()
  }, [])

  const stage = useMemo(() => stageDef(stageNo), [stageNo])
  const map = mapById(stage.mapId)
  const roster = useMemo(() => rollRoster(cfg, createRngState(save.rosterSeed)).units, [cfg, save.rosterSeed])
  // 저장된 배치 중 지금 보관함·설정에 맞는 것만
  const placements = useMemo(() => {
    const p: Placements = {}
    const saved = save.placementsByMap[map.id] ?? {}
    for (const u of roster) {
      const c = saved[u.id]
      if (c && map.tiles[c.y]?.[c.x] === 'slot' && Object.keys(p).length < cfg.maxDeploy) p[u.id] = c
    }
    return p
  }, [save.placementsByMap, map, roster, cfg.maxDeploy])
  const setPlacements = (p: Placements) => setSave((s) => ({ ...s, placementsByMap: { ...s.placementsByMap, [map.id]: p } }))

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<WaveSim | null>(null)
  const fxRef = useRef<Fx[]>([])
  const animRef = useRef(newAnimState())
  const accRef = useRef(0)
  const live = useRef({ cfg, map, roster, placements, selectedId, hover, speed, paused, screen, stageNo })
  live.current = { cfg, map, roster, placements, selectedId, hover, speed, paused, screen, stageNo }

  // 그리기 + 진행 루프 (판이 보이는 화면에서만)
  const showBoard = screen !== 'select' && screen !== 'bench'
  useEffect(() => {
    if (!showBoard) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()
    let lastUi = 0
    const loop = (now: number) => {
      const L = live.current
      const dt = Math.min(250, now - last)
      last = now
      const sim = simRef.current
      const tickMs = 1000 / L.cfg.tickRate
      if (sim && !sim.done && !L.paused && L.screen === 'play') {
        accRef.current += dt * L.speed
        while (accRef.current >= tickMs && !sim.done) {
          accRef.current -= tickMs
          stepWave(sim)
          collectFx(sim, now)
        }
        if (sim.done) finishStage(sim)
      }
      if (now - lastUi > 100) {
        lastUi = now
        setUiTick((t) => t + 1)
      }
      fxRef.current = fxRef.current.filter((f) => now - f.born < f.life)
      // 판은 논리 크기(W×H)로 그리고, 화면이 좁으면 CSS(max-width:100%)로 줄어든다.
      // 실제 표시 폭 × dpr 로 비트맵을 다시 잡아서 줄어들어도 흐려지지 않게.
      const dpr = window.devicePixelRatio || 1
      const W = L.map.width * CELL_PX + PAD * 2
      const H = L.map.height * CELL_PX + PAD * 2
      if (canvas.style.width !== `${W}px`) canvas.style.width = `${W}px`
      const scale = (canvas.clientWidth || W) / W
      const bw = Math.round(W * scale * dpr)
      const bh = Math.round(H * scale * dpr)
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw
        canvas.height = bh
      }
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
      const s = L.screen === 'prepare' ? null : simRef.current
      const anim = animRef.current
      // 애니메이션 시계: 진행 중엔 게임 시간(일시정지·배속 따라감), 준비 화면은 실제 시간
      anim.clock = s ? (s.tick - 1 + (s.done ? 1 : Math.min(1, accRef.current / tickMs))) * tickMs : now
      anim.corpses = anim.corpses.filter((c) => anim.clock - c.at < motionDuration(c.sprite, 'die') + 100)
      draw(ctx, {
        anim,
        cfg: L.cfg,
        map: L.map,
        roster: L.roster,
        placements: L.placements,
        sim: s,
        alpha: s && !s.done ? Math.min(1, accRef.current / tickMs) : 1,
        selectedId: L.selectedId,
        hover: L.screen === 'prepare' ? L.hover : null,
        fx: fxRef.current,
        now,
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBoard])

  function collectFx(sim: WaveSim, now: number) {
    const { map, cfg } = live.current
    const anim = animRef.current
    const at = (sim.tick - 1) * (1000 / cfg.tickRate)
    const unitPos = (id: string) => {
      const u = sim.units.find((x) => x.inst.id === id)
      return u ? { x: (u.cell.x + 0.5) * CELL_PX, y: (u.cell.y + 0.5) * CELL_PX } : null
    }
    for (const ev of sim.events) {
      if (ev.type === 'proc') {
        fxRef.current.push({ kind: 'text', born: now, life: 900, to: { ...monsterScreenPos(map, ev.dist, ev.monsterId), y: monsterScreenPos(map, ev.dist, ev.monsterId).y - 14 }, text: ABILITY_NAMES[ev.kind] + '!', color: '#ffeb3b' })
        const p = unitPos(ev.unitId)
        if (p) fxRef.current.push({ kind: 'skill', born: now, life: 500, to: p, color: '#ffeb3b' })
        continue
      }
      if (ev.type === 'poison') {
        fxRef.current.push({ kind: 'text', born: now, life: 600, to: monsterScreenPos(map, ev.dist, ev.monsterId), text: `${ev.amount}`, color: '#ce93d8' })
        continue
      }
      if (ev.type === 'thorn') {
        fxRef.current.push({ kind: 'text', born: now, life: 600, to: monsterScreenPos(map, ev.dist, ev.monsterId), text: `${ev.amount}`, color: '#ef9a9a' })
        continue
      }
      if (ev.type === 'kill') {
        const p = monsterScreenPos(map, ev.dist, ev.monsterId)
        const spec = sim.stage.monsters[ev.monsterType]
        anim.corpses.push({ type: ev.monsterType, sprite: spec ? monsterSprite(spec) : `mon_${ev.monsterType}`, size: spec?.size ?? 0.22, x: p.x, y: p.y, flip: anim.monsterFlip.get(ev.monsterId) ?? false, at })
        anim.monsterHitAt.delete(ev.monsterId)
        anim.monsterFlip.delete(ev.monsterId)
        continue
      }
      if (ev.type === 'hit' || ev.type === 'miss') {
        if (!(ev.type === 'hit' && ev.splash)) anim.unitAttackAt.set(ev.unitId, at)
        if (ev.type === 'hit') anim.monsterHitAt.set(ev.monsterId, at)
        const from = unitPos(ev.unitId)
        const u = sim.units.find((x) => x.inst.id === ev.unitId)
        if (!from || !u) continue
        const to = monsterScreenPos(map, ev.dist, ev.monsterId)
        // 평타 효과 (2026-11-27): 사거리 2 = 빛 구슬이 날아감 · 사거리 1 = 몬스터 앞에서 베기. 맞으면 팡, 숫자는 도착할 때
        if (ev.type === 'hit' && ev.splash) {
          fxRef.current.push({ kind: 'burst', born: now + 120, life: 260, to, color: '#ffb74d', size: 0.8 })
          fxRef.current.push({ kind: 'text', born: now + 120, life: 600, to, text: `${ev.amount}`, color: '#ffb74d' })
          continue
        }
        const crit = ev.type === 'hit' && ev.crit
        const color = crit ? '#ff5252' : unitLook(live.current.cfg, u.inst).color
        const size = crit ? 1.6 : 1
        const hand = { x: from.x + CELL_PX * 0.12, y: from.y - CELL_PX * 0.05 }
        const ranged = u.inst.range >= 2
        const d = Math.hypot(to.x - hand.x, to.y - hand.y)
        const travel = ranged ? Math.min(200, Math.max(80, d * 0.9)) : 0
        if (ranged) {
          // 빗나가면 몬스터를 지나쳐 날아감
          const end = ev.type === 'miss' ? { x: to.x + ((to.x - hand.x) / d) * 26, y: to.y + ((to.y - hand.y) / d) * 26 } : to
          fxRef.current.push({ kind: 'bolt', born: now, life: travel, from: hand, to: end, color, size })
        } else {
          fxRef.current.push({ kind: 'slash', born: now, life: 220, to, color, size, angle: Math.atan2(to.y - from.y, to.x - from.x) })
        }
        if (ev.type === 'miss') {
          fxRef.current.push({ kind: 'text', born: now + travel, life: 600, to, text: '빗나감', color: '#b0bec5' })
          continue
        }
        fxRef.current.push({ kind: 'burst', born: now + travel, life: crit ? 380 : 260, to, color, size })
        fxRef.current.push({ kind: 'text', born: now + travel, life: crit ? 900 : 600, to, text: crit ? `${ev.amount}!!` : `${ev.amount}`, color: crit ? '#ff5252' : '#fff' })
        if (crit) anim.shakeUntil = now + travel + 160
      } else if (ev.type === 'leak') {
        const e = map.path.at(-1)!
        fxRef.current.push({ kind: 'leak', born: now, life: 500, to: { x: (e.x + 0.5) * CELL_PX, y: (e.y + 0.5) * CELL_PX } })
      } else if (ev.type === 'resist') {
        fxRef.current.push({ kind: 'text', born: now, life: 700, to: { ...monsterScreenPos(map, ev.dist, ev.monsterId), y: monsterScreenPos(map, ev.dist, ev.monsterId).y - 14 }, text: '버팀!', color: '#b0bec5' })
      } else if (ev.type === 'block') {
        anim.unitAttackAt.set(ev.unitId, at)
        fxRef.current.push({ kind: 'text', born: now, life: 600, to: monsterScreenPos(map, ev.dist, ev.monsterId), text: '무적', color: '#ffd54f' })
      } else if (ev.type === 'mskill') {
        const to = monsterScreenPos(map, ev.dist, ev.monsterId)
        const def = MONSTER_ABILITIES[ev.kind]
        const color = MSKILL_COLOR[ev.kind]
        fxRef.current.push({ kind: 'text', born: now, life: 900, to: { x: to.x, y: to.y - 14 }, text: `${def.icon} ${def.name}!`, color })
        fxRef.current.push({ kind: 'skill', born: now, life: 600, to, color })
        for (const id of ev.unitIds) {
          const p = unitPos(id)
          if (p) fxRef.current.push({ kind: 'shot', born: now, life: 300, from: to, to: p, color })
        }
        for (const id of ev.dodgedIds) {
          const p = unitPos(id)
          if (p) fxRef.current.push({ kind: 'text', born: now, life: 800, to: p, text: '피함!', color: '#a5d6a7' })
        }
      }
    }
  }

  function finishStage(sim: WaveSim) {
    if (live.current.screen !== 'play') return
    const n = live.current.stageNo
    const cleared = sim.lives > 0
    const text = (sim.bossLeaked ? '왕이 통과했어요 (왕은 꼭 잡아야 해요) · ' : '') + `${sim.killed}마리 처치 · ${sim.leaked}마리 통과 · ${(sim.tick / live.current.cfg.tickRate).toFixed(0)}초`
    const stars = starsFor(cleared, sim.leaked)
    if (cleared) setSave((s) => ({ ...s, best: Math.max(s.best, n), stars: { ...s.stars, [n]: Math.max(s.stars?.[n] ?? 0, stars) } }))
    setResult({ cleared, text, stars })
    live.current.screen = 'result'
    setScreen('result')
  }

  /**
   * 뒤로 가기 (2026-11-27): 탄 고르기가 아닌 화면(탄 준비·진행·결과·성능 시험)에 들어갈 때 브라우저 기록을 한 칸 쌓음
   * → 그 화면에서 뒤로 가기 = 탄 고르기로 (진행 중이면 일시정지하고 물어봄), 탄 고르기에서 뒤로 가기 = 진짜 이전 페이지
   */
  const enterSubScreen = () => {
    if (live.current.screen === 'select') history.pushState({ sub: true }, '')
  }
  /** 화면 버튼으로 탄 고르기에 돌아가기: 쌓은 기록 한 칸을 되돌림 → popstate 에서 이동 */
  const goSelect = () => {
    leavingRef.current = true
    history.back()
  }
  /** 진행 중 나가기: 일시정지하고 물어봄 */
  const askToLeave = () => {
    setAskLeave({ wasPaused: live.current.paused })
    setPaused(true)
  }

  useEffect(() => {
    const onPop = () => {
      const sc = live.current.screen
      if (leavingRef.current || sc === 'prepare' || sc === 'result' || sc === 'bench') {
        leavingRef.current = false
        setAskLeave(null)
        live.current.screen = 'select'
        setScreen('select')
        return
      }
      if (sc === 'play') {
        // 바로 나가지 않음: 기록을 다시 채워 두고 물어봄
        history.pushState({ sub: true }, '')
        askToLeave()
      }
      // 탄 고르기: 브라우저가 이전 페이지로 감
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openStage = (n: number) => {
    enterSubScreen()
    setStageNo(n)
    simRef.current = null
    fxRef.current = []
    setSelectedId(null)
    setResult(null)
    setScreen('prepare')
  }

  const startStage = () => {
    // 판마다 새 씨앗 → 다시 해도 장애물 자리·명중·특수능력 발동이 달라짐
    const playSeed = crypto.getRandomValues(new Uint32Array(1))[0]! || 1
    simRef.current = createWave(cfg, map, stage, roster, placements, cfg.startLives, playSeed)
    animRef.current = newAnimState()
    accRef.current = 0
    fxRef.current = []
    setSelectedId(null)
    setPaused(false)
    live.current.screen = 'play'
    setScreen('play')
  }

  const placedCount = Object.keys(placements).length

  const onCellClick = (c: Cell) => {
    if (screen !== 'prepare') {
      // 진행 중엔 지금 서 있는 자리 기준 (날려 보내기로 옮겨졌을 수 있음)
      const su = simRef.current?.units.find((u) => u.cell.x === c.x && u.cell.y === c.y)
      setSelectedId(su?.inst.id ?? null)
      return
    }
    const occupant = roster.find((u) => {
      const p = placements[u.id]
      return p && p.x === c.x && p.y === c.y
    })
    if (map.tiles[c.y]?.[c.x] !== 'slot') return
    const sel = roster.find((u) => u.id === selectedId)
    if (!sel) {
      setSelectedId(occupant?.id ?? null)
      return
    }
    if (occupant?.id === sel.id) {
      setSelectedId(null)
      return
    }
    const p = { ...placements }
    const from = p[sel.id]
    if (!from && !occupant && placedCount >= cfg.maxDeploy) return
    if (occupant) {
      if (from) p[occupant.id] = from
      else delete p[occupant.id]
    }
    p[sel.id] = c
    setPlacements(p)
    setSelectedId(null)
  }

  const removeUnit = (id: string) => {
    const p = { ...placements }
    delete p[id]
    setPlacements(p)
    setSelectedId(null)
  }

  const cellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): Cell => {
    // 화면에서 줄어든 비율만큼 되돌려서 논리 좌표로
    const r = e.currentTarget.getBoundingClientRect()
    const k = (map.width * CELL_PX + PAD * 2) / r.width
    return { x: Math.floor(((e.clientX - r.left) * k - PAD) / CELL_PX), y: Math.floor(((e.clientY - r.top) * k - PAD) / CELL_PX) }
  }

  const sim = simRef.current
  const maxOpen = save.unlockAll ? Infinity : save.best + 1

  if (screen === 'bench') return <Bench onBack={goSelect} />

  // ── 탄 고르기 ──
  if (screen === 'select') {
    const infinite = Math.max(LAST_NORMAL_STAGE + 1, save.best + 1)
    return (
      <div className="app">
        <header>
          <h1>디펜스 시험판</h1>
          <div className="stats">
            <span>🏆 최고 기록 {save.best}탄</span>
          </div>
        </header>
        <section>
          <h3>탄 고르기</h3>
          <StageMap count={LAST_NORMAL_STAGE} best={save.best} stars={save.stars ?? {}} maxOpen={maxOpen} onOpen={openStage} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary inline" disabled={save.best < LAST_NORMAL_STAGE && !save.unlockAll} onClick={() => openStage(infinite)}>
              ♾ 무한 ({infinite}탄)
            </button>
            <span className="dim">100탄을 깨면 열림. 그 뒤로 끝없이 어려워짐</span>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label className="dim">
              <input type="checkbox" checked={save.unlockAll} onChange={(e) => setSave({ ...save, unlockAll: e.target.checked })} /> 시험용: 모든 탄 열기
            </label>
            <button onClick={() => confirm('최고 기록을 0으로 되돌릴까요?') && setSave({ ...save, best: 0 })}>기록 지우기</button>
            <button
              onClick={() => {
                enterSubScreen()
                live.current.screen = 'bench'
                setScreen('bench')
              }}
            >
              🧪 그리기 성능 시험 (200개~)
            </button>
            <a className="dim" href="sprites/preview.html" target="_blank">스프라이트 모아 보기</a>
          </div>
        </section>
        <section>
          <h3>내 캐릭 ({roster.length}명)</h3>
          <ul className="roster">
            {roster.map((u) => (
              <UnitRow key={u.id} u={u} cfg={cfg} />
            ))}
          </ul>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => setSave({ ...save, rosterSeed: `시험판-${Math.floor(Math.random() * 1e6)}`, placementsByMap: {} })}>🎲 캐릭 다시 뽑기</button>
            <span className="dim">씨앗: {save.rosterSeed}</span>
          </div>
        </section>
        <section>
          <button className="link" onClick={() => setShowSettings(!showSettings)}>
            ⚙ 설정 {showSettings ? '접기' : '펼치기'}
          </button>
          {showSettings && <Settings cfg={cfg} onChange={(p) => setCfg({ ...cfg, ...p })} />}
        </section>
      </div>
    )
  }

  // ── 탄 준비 · 진행 · 결과 (판이 보이는 화면) ──
  const summary = stageSummary(stage)
  return (
    <div className="app">
      <header>
        <h1>
          <button className="link back" onClick={() => (screen === 'play' ? askToLeave() : goSelect())} title="탄 고르기로">
            ←
          </button>{' '}
          {stageNo}탄 {stage.isBoss && <span className="boss-tag">우두머리</span>}
          {stageNo > LAST_NORMAL_STAGE && <span className="inf-tag">무한</span>}
        </h1>
        <div className="stats">
          <span>🚪 통과 {sim && screen !== 'prepare' ? sim.leaked : 0}/{cfg.startLives - 1}</span>
          {sim && screen !== 'prepare' && (
            <span>
              ⏱ {(sim.tick / cfg.tickRate).toFixed(1)}초 · 남은 몬스터 {sim.spawns.length - sim.spawnIdx + sim.monsters.length}
            </span>
          )}
          <span>🏆 {save.best}탄</span>
        </div>
      </header>

      {askLeave && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-title">⏸ 일시정지</div>
            <p>탄 고르기로 갈까요?<br />지금 하던 판은 사라집니다.</p>
            <div className="row">
              <button
                className="primary inline"
                onClick={() => {
                  setPaused(askLeave.wasPaused)
                  setAskLeave(null)
                }}
              >
                계속하기
              </button>
              <button
                onClick={() => {
                  setAskLeave(null)
                  goSelect()
                }}
              >
                탄 고르기로
              </button>
            </div>
          </div>
        </div>
      )}
      <main>
        <div className="board">
          {screen === 'result' && result && (
            <ResultOverlay
              cleared={result.cleared}
              stars={result.stars}
              stage={stageNo}
              detail={result.text}
              onNext={() => openStage(stageNo + 1)}
              onRetry={() => openStage(stageNo)}
              onSelect={goSelect}
            />
          )}
          <canvas
            ref={canvasRef}
            onClick={(e) => onCellClick(cellFromEvent(e))}
            onMouseMove={(e) => {
              const c = cellFromEvent(e)
              if (c.x !== hover?.x || c.y !== hover?.y) setHover(c)
            }}
            onMouseLeave={() => setHover(null)}
          />
          {screen === 'play' && (
            <div className="controls">
              <button className={paused ? 'on' : ''} onClick={() => setPaused(!paused)}>
                {paused ? '▶ 계속' : '⏸ 일시정지'}
              </button>
              {[1, 2, 4].map((s) => (
                <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
          )}
        </div>

        <aside>
          <section>
            <h3>
              출연 몬스터 <span className="dim">· 맵 {map.name} · 길 {map.path.length}칸</span>
            </h3>
            <p className="dim" style={{ margin: '0 0 6px' }}>
              {stageNo <= REFERENCE_MAX_STAGE
                ? `기준: 특수능력 없는 10명이 평균 ${referenceSummary(stageNo)} 이면 겨우 깸 (2마리까지 통과)`
                : `기준 덱(능력치 최고 10명)으로는 못 깸 — 특수능력이 있어야 함 (70탄보다 체력 +${Math.round((stageHpBp(stageNo) / stageHpBp(REFERENCE_MAX_STAGE) - 1) * 100)}%)`}
            </p>
            <ul className="monsters">
              {summary.map(({ spec, count }) => (
                <MonsterRow key={spec.id} spec={spec} count={count} cfg={cfg} />
              ))}
            </ul>
            {screen === 'prepare' && (
              <>
                <button className="primary" disabled={placedCount === 0} onClick={startStage}>
                  ▶ 게임 시작
                </button>
                <p className="hint">캐릭을 고른 뒤 초록 칸을 누르면 배치 · 판 위 캐릭을 고르고 다른 칸을 누르면 이동·자리 바꾸기. 시간 제한 없음. 배치는 맵마다 기억됨.</p>
              </>
            )}
          </section>

          <section>
            <h3>
              덱 ({placedCount} / {cfg.maxDeploy} 출전)
            </h3>
            <ul className="roster">
              {roster.map((u) => {
                const placed = !!placements[u.id]
                return (
                  <UnitRow
                    key={u.id}
                    u={u}
                    cfg={cfg}
                    selected={selectedId === u.id}
                    placed={placed}
                    onClick={() => setSelectedId(selectedId === u.id ? null : u.id)}
                  >
                    {screen === 'prepare' && placed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeUnit(u.id)
                        }}
                      >
                        빼기
                      </button>
                    )}
                  </UnitRow>
                )
              })}
            </ul>
            {selectedId && screen === 'prepare' && <p className="hint">노란 칸 = 사거리 (마우스를 올린 칸 기준)</p>}
          </section>
        </aside>
      </main>
    </div>
  )
}

function MonsterRow({ spec, count, cfg }: { spec: MonsterSpec; count: number; cfg: DefenseConfig }) {
  const hp = Math.max(1, Math.floor((spec.hp * cfg.monsterHpBp) / 10000))
  const speed = (spec.speed * cfg.monsterSpeedBp) / 10000 / 1000
  return (
    <li>
      <div>
        <i className="dot" style={{ background: spec.color }} />
        <b>{spec.name}</b> ×{count}
        <span className="dim">
          {' '}
          체력 {hp} · 방어 {spec.armor} · 민첩 {spec.agility} · 속도 {speed.toFixed(1)}칸/초
        </span>
      </div>
      {spec.abilities.map((a) => (
        <div key={a} className="mab">
          ◆ {MONSTER_ABILITIES[a].name}: {monsterAbilityDesc(a, spec)}
        </div>
      ))}
    </li>
  )
}

/** 캐릭 얼굴: 스프라이트 첫 프레임(몸 + 도구)을 작게 */
function UnitFace({ body, tool }: { body: string; tool: string | null }) {
  const bg = [tool, body].filter(Boolean).map((id) => `url(sprites/${id}.png)`).join(', ')
  return <span className="face sprite" style={{ backgroundImage: bg }} />
}

/** 능력치 한 줄. 닌자·장군이 올린 값은 ▲ 표시 */
function statText(cfg: DefenseConfig, u: UnitInstance): string {
  const b = baseStats(cfg, u)
  const v = (now: number, orig: number) => (now !== orig ? `${now}▲` : `${now}`)
  return `공격 ${v(b.atk, u.atk)} · 사거리 ${b.range} · 공속 ${v(b.attackSpeed, u.attackSpeed)} · 민첩 ${v(b.agility, u.agility)}`
}

function UnitRow(props: {
  u: UnitInstance
  cfg: DefenseConfig
  selected?: boolean
  placed?: boolean
  onClick?: () => void
  children?: React.ReactNode
}) {
  const { u } = props
  const look = unitLook(props.cfg, u)
  const ab = abilityText(u)
  return (
    <li className={`${props.selected ? 'sel' : ''} ${props.placed ? 'placed' : ''} ${look.tier === 6 ? 'rainbow-row' : ''}`} onClick={props.onClick}>
      <UnitFace body={look.body} tool={look.tool} />
      <div className="info">
        <div>
          <b className={`tier ${look.tierName === '무지개' ? 'rainbow' : ''}`} style={{ color: look.color }}>{look.title}</b> {statText(props.cfg, u)}
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

function Settings({ cfg, onChange }: { cfg: DefenseConfig; onChange: (p: Partial<DefenseConfig>) => void }) {
  const num = (label: string, value: number, apply: (v: number) => Partial<DefenseConfig>, step = 1, min = 0) => (
    <label className="setting">
      <span>{label}</span>
      <input type="number" value={value} step={step} min={min} onChange={(e) => onChange(apply(Number(e.target.value) || 0))} />
    </label>
  )
  const range = (label: string, key: 'atk' | 'range', step = 1, min = 0) => (
    <>
      {num(`${label} 최소`, cfg[key].min, (v) => ({ [key]: { min: v, max: Math.max(v, cfg[key].max) } }), step, min)}
      {num(`${label} 최대`, cfg[key].max, (v) => ({ [key]: { min: Math.min(v, cfg[key].min), max: v } }), step, min)}
    </>
  )
  return (
    <div className="settings">
      <label className="setting">
        <span>사거리 모양</span>
        <select value={cfg.rangeShape} onChange={(e) => onChange({ rangeShape: e.target.value as DefenseConfig['rangeShape'] })}>
          <option value="diamond">마름모 (가로+세로)</option>
          <option value="square">사각형 (대각선 포함)</option>
        </select>
      </label>
      {num('출전 수', cfg.maxDeploy, (v) => ({ maxDeploy: Math.max(1, v) }), 1, 1)}
      {range('공격력', 'atk')}
      {range('사거리', 'range', 1, 1)}
      {num('공속 최소 (1초에 N대)', cfg.attackSpeed.min, (v) => ({ attackSpeed: { min: clampSpeed(v), max: Math.max(clampSpeed(v), cfg.attackSpeed.max) } }), 1, 1)}
      {num('공속 최대 (1초에 N대)', cfg.attackSpeed.max, (v) => ({ attackSpeed: { min: Math.min(clampSpeed(v), cfg.attackSpeed.min), max: clampSpeed(v) } }), 1, 1)}
      {num('민첩 최소', cfg.agility.min, (v) => ({ agility: { min: v, max: Math.max(v, cfg.agility.max) } }), 1, 1)}
      {num('민첩 최대', cfg.agility.max, (v) => ({ agility: { min: Math.min(v, cfg.agility.min), max: v } }), 1, 1)}
      {num('몬스터 속도 (%)', cfg.monsterSpeedBp / 100, (v) => ({ monsterSpeedBp: Math.max(10, v) * 100 }), 10, 10)}
      {num('몬스터 체력 (%)', cfg.monsterHpBp / 100, (v) => ({ monsterHpBp: Math.max(10, v) * 100 }), 10, 10)}
      {num('몇 마리 통과하면 실패', cfg.startLives, (v) => ({ startLives: Math.max(1, v) }), 1, 1)}
      {num('특수능력 확률 (%)', cfg.abilityChanceBp / 100, (v) => ({ abilityChanceBp: Math.min(100, v) * 100 }), 10)}
      <button onClick={() => onChange({ ...DEFAULT_CONFIG })}>기본값으로</button>
      <p className="dim" style={{ gridColumn: '1 / -1', margin: 0 }}>
        능력치 범위를 바꾸면 캐릭이 다시 뽑힙니다 (같은 씨앗이라도 숫자가 달라짐).
      </p>
    </div>
  )
}
