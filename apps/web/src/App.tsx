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
  pathIndexAt,
  SPLASH_RADIUS,
  SHOP_PRICES,
  type TicketKind,
  baseStats,
  starsFor,
  REFERENCE_MAX_STAGE,
  referenceSummary,
  stageHpBp,
  type Account,
  type StageReward,
  TICKET_NAMES,
  statScore,
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
import { Codex } from './Codex.tsx'
import { ResultOverlay } from './ResultOverlay.tsx'
import { SpriteGallery } from './SpriteGallery.tsx'
import { StageMap } from './StageMap.tsx'
import { unitLook, stageName, stageTheme } from './format.ts'
import { RosterTools, splitDesc, UnitFace, UnitRow, viewRoster, type RosterView } from './UnitList.tsx'
import { Barracks } from './Barracks.tsx'
import type { GameApi } from './api/api.ts'
import { createLocalApi } from './api/localApi.ts'

const MAPS = MAP_DEFS.map(parseMap)
const mapById = (id: string) => MAPS.find((m) => m.id === id)!

/** 화면: 탄 고르기 → 탄 준비(출연 몬스터 보고 배치) → 진행 → 결과 */
type Screen = 'select' | 'prepare' | 'play' | 'result' | 'bench'

/**
 * 브라우저에 저장하는 화면 설정 (2026-11-27).
 * 캐릭·권·최고 기록·별은 "계정"이라 여기 말고 api(지금은 localApi, 나중엔 서버)가 가짐
 */
interface Save {
  rosterSeed: string
  placementsByMap: Record<string, Placements>
  unlockAll: boolean
}
const SAVE_KEY = 'defense.save.v1'
function loadSave(): Save {
  const empty: Save = { rosterSeed: '시험판-1', placementsByMap: {}, unlockAll: false }
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
  agiSteal: '#4db6ac',
  absorb: '#69f0ae',
  split: '#aed581',
}

const pct = (bp: number) => `${Math.round(bp / 100)}%`
/** 뽑기 공속은 1~5 */
const clampSpeed = (v: number) => Math.min(5, Math.max(1, Math.round(v)))

export function App() {
  const [cfg, setCfg] = useState<DefenseConfig>({ ...DEFAULT_CONFIG })
  // 캐릭 목록 필터·정렬 (두 화면 공통)
  const [view, setView] = useState<RosterView>({ filter: 'all', sort: 'score' })
  // 아래 고정 메뉴 (2026-11-27): 막사 · 스테이지 · 상점
  const [tab, setTab] = useState<Tab>('stages')
  const [shopTab, setShopTab] = useState<'shop' | 'trade'>('shop')
  /** 개발자 탭: 스프라이트 모아 보기 펼침 */
  const [showSprites, setShowSprites] = useState(false)
  const [save, setSave] = useState<Save>(loadSave)
  // 계정 창구: 지금은 브라우저 안(localApi), 서버를 붙이면 serverApi 로 바꿈 (화면 코드는 그대로)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  // 개발자 메뉴를 숨기면 "모든 탄 열기"도 저장값과 상관없이 꺼짐
  const unlockAll = SHOW_DEV_MENU && save.unlockAll
  const unlockRef = useRef(unlockAll)
  unlockRef.current = unlockAll
  const api = useMemo<GameApi>(() => createLocalApi(() => cfgRef.current, () => unlockRef.current), [])
  const [account, setAccount] = useState<Account | null>(null)
  useEffect(() => {
    void api.loadAccount().then(setAccount)
  }, [api])
  const best = account?.best ?? 0
  // 탄 시작 때 받은 판 번호(runId)와 그때의 배치 → 끝나면 이걸로 판정 요청
  const runRef = useRef<{ runId: string; stageNo: number; placements: Placements } | null>(null)
  const [screen, setScreen] = useState<Screen>('select')
  const [stageNo, setStageNo] = useState(1)
  const [result, setResult] = useState<{ cleared: boolean; text: string; stars: number; reward?: StageReward } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  /** 진행 중 뒤로 가기를 눌렀을 때 묻는 창 (wasPaused = 창을 띄우기 전 일시정지였나) */
  const [askLeave, setAskLeave] = useState<{ wasPaused: boolean } | null>(null)
  /** 배치 화면: 눌러 본 출연 몬스터 (2026-11-28) */
  const [monsterInfo, setMonsterInfo] = useState<{ spec: MonsterSpec; count: number } | null>(null)
  /** 화면 버튼으로 탄 고르기에 돌아가는 중 (history.back 뒤 popstate 에서 묻지 않고 이동) */
  const leavingRef = useRef(false)
  const [, setUiTick] = useState(0)

  useEffect(() => localStorage.setItem(SAVE_KEY, JSON.stringify(save)), [save])
  useEffect(() => {
    void loadSprites()
  }, [])

  const stage = useMemo(() => stageDef(stageNo), [stageNo])
  const map = mapById(stage.mapId)
  const roster = useMemo(() => account?.units ?? [], [account])
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
      // 배치 화면은 판을 작게(화면 높이의 약 42%) → 아래 캐릭 목록이 더 보이게 (2026-11-28)
      // 진행·결과 화면은 판을 최대한 크게: 폭은 화면 폭까지, 높이는 위 제목·아래 조작/가로 목록 몫(약 230px)만 남김 (2026-11-28)
      const ratio = (W / H).toFixed(4)
      const want = L.screen === 'prepare' ? `min(${W}px, calc(42dvh * ${ratio}))` : `min(${Math.round(W * 1.5)}px, max(calc(240px * ${ratio}), calc((100dvh - 180px) * ${ratio})))`
      if (canvas.style.width !== want) canvas.style.width = want
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
        theme: stageTheme(L.stageNo),
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
        if (ev.kind === 'splash') {
          // 광역공격: 맞힌 몬스터가 있는 칸 중심 범위 번쩍 + 판 흔들림
          const c = map.path[pathIndexAt(map, ev.dist)]!
          fxRef.current.push({ kind: 'area', born: now, life: 550, to: { x: (c.x + 0.5) * CELL_PX, y: (c.y + 0.5) * CELL_PX }, radius: SPLASH_RADIUS })
          anim.shakeUntil = now + 180
        }
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
      } else if (ev.type === 'immune') {
        fxRef.current.push({ kind: 'text', born: now, life: 800, to: { ...monsterScreenPos(map, ev.dist, ev.monsterId), y: monsterScreenPos(map, ev.dist, ev.monsterId).y - 14 }, text: '왕은 안 통함', color: '#b0bec5' })
      } else if (ev.type === 'heal') {
        // 흡수: 피해가 체력으로
        if (ev.amount > 0) fxRef.current.push({ kind: 'text', born: now, life: 600, to: monsterScreenPos(map, ev.dist, ev.monsterId), text: `+${ev.amount}`, color: '#69f0ae' })
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
    live.current.screen = 'result'
    const run = runRef.current
    runRef.current = null
    const show = (r: { cleared: boolean; stars: number; killed: number; leaked: number; ticks: number; bossLeaked: boolean; reward?: StageReward }, note = '') => {
      const text = (r.bossLeaked ? '왕이 통과했어요 (왕은 꼭 잡아야 해요) · ' : '') + `${r.killed}마리 처치 · ${r.leaked}마리 통과 · ${(r.ticks / live.current.cfg.tickRate).toFixed(0)}초` + note
      setResult({ cleared: r.cleared, text, stars: r.stars, reward: r.reward })
      setScreen('result')
    }
    const mine = { cleared: sim.lives > 0, stars: starsFor(sim.lives > 0, sim.leaked), killed: sim.killed, leaked: sim.leaked, ticks: sim.tick, bossLeaked: sim.bossLeaked }
    if (!run) return show(mine)
    api
      .finishStage(run)
      .then(({ account, result }) => {
        setAccount(account)
        // 판정은 다시 돌린 결과를 믿음 (화면 결과와 다르면 알림 — 엔진 결정성이 깨졌다는 뜻)
        if (result.cleared !== mine.cleared || result.stars !== mine.stars) console.warn('화면 결과와 판정이 다름', mine, result)
        show(result)
      })
      .catch((e: unknown) => show(mine, ` · ⚠ 기록 안 됨: ${e instanceof Error ? e.message : String(e)}`))
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
    if (live.current.screen !== 'play') return
    // 이미 창이 떠 있으면 그대로 (뒤로 가기를 여러 번 눌러도 게임이 다시 돌지 않게)
    setAskLeave((cur) => cur ?? { wasPaused: false })
    setPaused(true)
  }
  // Esc(취소) 키 = 일시정지 창 (기기 뒤로 가기와 같음)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && live.current.screen === 'play') askToLeave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const startStage = async () => {
    // 판마다 새 씨앗 (api 가 정함 — 서버라면 서버가 정해서 조작 불가) → 다시 해도 장애물 자리·명중·특수능력 발동이 달라짐
    const { runId, seed } = await api.startStage(stageNo)
    runRef.current = { runId, stageNo, placements: { ...placements } }
    simRef.current = createWave(cfg, map, stage, roster, placements, cfg.startLives, seed)
    animRef.current = newAnimState()
    accRef.current = 0
    fxRef.current = []
    setSelectedId(null)
    setPaused(false)
    live.current.screen = 'play'
    setScreen('play')
  }

  const placedCount = Object.keys(placements).length

  /** 진행 화면: 제목 높이를 CSS 변수로 → 판이 제목 바로 아래에 붙음 (제목·판 고정, 아래 목록만 스크롤, 2026-11-28) */
  useEffect(() => {
    const head = document.querySelector<HTMLElement>('header.play-head')
    if (!head) return
    const update = () => document.documentElement.style.setProperty('--head-h', `${Math.floor(head.getBoundingClientRect().height)}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(head)
    return () => ro.disconnect()
  }, [screen])

  /** 판 높이를 CSS 변수로 → 목록 머리(.roster-head)가 판 바로 아래에 붙음. 판이 옆에 있는 넓은 화면이면 0 */
  useEffect(() => {
    const board = document.querySelector<HTMLElement>('.board')
    const aside = document.querySelector<HTMLElement>('main > aside')
    if (!board || !aside) return
    const update = () => {
      const b = board.getBoundingClientRect()
      const stacked = aside.getBoundingClientRect().left < b.right - 1
      document.documentElement.style.setProperty('--board-h', stacked ? `${Math.floor(b.height)}px` : '0px')
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(board)
    ro.observe(aside)
    return () => ro.disconnect()
  }, [screen])

  /** 판에서 캐릭을 고르면 아래 목록에서 그 캐릭이 보이게 스크롤 (2026-11-28) */
  const scrollToUnit = (id: string | null | undefined) => {
    if (!id) return
    requestAnimationFrame(() => {
      const li = document.querySelector(`.roster [data-unit-id="${id}"]`)
      if (!li) return
      // 위에 붙은 판 바로 아래로 오게 (가운데로 맞추면 판에 가려질 수 있음)
      const boardH = document.querySelector('.board')?.getBoundingClientRect().height ?? 0
      const headH = document.querySelector('.roster-head')?.getBoundingClientRect().height ?? 0
      const top = li.getBoundingClientRect().top + window.scrollY - boardH - headH - 8
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    })
  }

  const onCellClick = (c: Cell) => {
    if (screen !== 'prepare') {
      // 진행 중엔 지금 서 있는 자리 기준 (날려 보내기로 옮겨졌을 수 있음)
      const su = simRef.current?.units.find((u) => u.cell.x === c.x && u.cell.y === c.y)
      setSelectedId(su?.inst.id ?? null)
      scrollToUnit(su?.inst.id)
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
      scrollToUnit(occupant?.id)
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
  const maxOpen = unlockAll ? Infinity : best + 1

  if (screen === 'bench') return <Bench onBack={goSelect} />

  // ── 첫 화면: 아래 고정 메뉴로 막사 · 스테이지 · 상점 (2026-11-27) ──
  if (screen === 'select') {
    const shown = viewRoster(cfg, roster, view)
    return (
      <div className={`app with-tabbar ${tab === 'stages' ? 'stages-view' : ''}`}>
        {/* 제목 줄 없음 (2026-11-28): 지금 탭은 아래 메뉴가 알려 줌. 골드는 쓰는 곳(상점 탭 줄 · 막사)에서만 */}
        {/* 스테이지 (2026-11-28): 풀밭 지도가 화면을 가득 채움 (아래 메뉴·정보 알약은 그 위에 떠 있음).
            무한 버튼 대신 100탄 위로 지도가 이어짐: 무한 1, 무한 2 … (깬 탄 + 몇 개 미리 보기) */}
        {tab === 'stages' && <StageMap count={Math.max(LAST_NORMAL_STAGE, best + INFINITE_PREVIEW)} best={best} stars={account?.stars ?? {}} maxOpen={maxOpen} onOpen={openStage} bottomSpace={TABBAR_SPACE} />}

        {tab === 'barracks' && account && (
          <Barracks
            cfg={cfg}
            account={account}
            api={api}
            onAccount={(next, removed) => {
              setAccount(next)
              // 합성으로 없어진 캐릭은 모든 맵 배치에서 뺌 (배치는 화면 설정)
              if (removed?.length)
                setSave((s) => ({
                  ...s,
                  placementsByMap: Object.fromEntries(Object.entries(s.placementsByMap).map(([m, p]) => [m, Object.fromEntries(Object.entries(p).filter(([id]) => !removed.includes(id)))])),
                }))
            }}
            view={view}
            onView={setView}
          />
        )}

        {tab === 'shop' && (
          <section>
            <div className="shop-top">
              <div className="seg">
                <button className={shopTab === 'shop' ? 'on' : ''} onClick={() => setShopTab('shop')}>
                  상점
                </button>
                <button className={shopTab === 'trade' ? 'on' : ''} onClick={() => setShopTab('trade')}>
                  거래소
                </button>
              </div>
              <span className="gold-pill">💰 {account?.gold ?? 0}</span>
            </div>
            {shopTab === 'shop' ? (
              <>
                <p className="dim">탄을 깨서 모은 골드로 티켓을 사요</p>
                <ul className="shop-list">
                  {SHOP_ITEMS.map((it) => {
                    const price = SHOP_PRICES[it.kind]
                    const gold = account?.gold ?? 0
                    const have = account?.tickets[it.kind] ?? 0
                    return (
                      <li key={it.kind}>
                        <span className="big">{it.icon}</span>
                        <div>
                          <b>{TICKET_NAMES[it.kind]}</b>
                          <div className="dim">
                            {it.desc} · 가진 것 {have}장
                          </div>
                        </div>
                        <button
                          className="buy"
                          disabled={gold < price}
                          onClick={() =>
                            void api
                              .barracks({ type: 'buy', kind: it.kind })
                              .then(({ account: a }) => setAccount(a))
                              .catch((e: unknown) => alert(e instanceof Error ? e.message : String(e)))
                          }
                        >
                          💰 {price}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p className="dim">다른 사람과 캐릭을 주고받는 곳 (서버를 붙인 뒤 만듦, 준비 중)</p>
            )}
          </section>
        )}

        {/* 설정 (2026-11-28): 지금은 도감만. 나중에 계정·소리 등 */}
        {tab === 'settings' && <Codex />}

        {/* 개발자 메뉴 (2026-11-28): 시험용 기능 전부 여기. 숨기려면 SHOW_DEV_MENU = false */}
        {tab === 'dev' && SHOW_DEV_MENU && (
          <>
            <section>
              <h3>진행</h3>
              <div className="row">
                <label>
                  <input type="checkbox" checked={save.unlockAll} onChange={(e) => setSave({ ...save, unlockAll: e.target.checked })} /> 모든 탄 열기
                </label>
                <button onClick={() => confirm('최고 기록을 0으로 되돌릴까요?') && void api.dev?.setBest(0).then(setAccount)}>기록 지우기</button>
              </div>
            </section>
            <section>
              <h3>막사</h3>
              <div className="row">
                <button onClick={() => void api.dev?.grantTickets(5).then(setAccount)}>🎟️ 티켓 모두 +5</button>
                <button
                  onClick={() =>
                    confirm('막사 캐릭을 모두 새로 뽑을까요? (배치도 지워짐)') &&
                    void api.dev?.resetBarracks(`시험판-${Math.floor(Math.random() * 1e6)}`).then((a) => {
                      setAccount(a)
                      setSave((s) => ({ ...s, placementsByMap: {} }))
                    })
                  }
                >
                  🎲 막사 전체 다시 뽑기
                </button>
              </div>
            </section>
            <section>
              <h3>그림</h3>
              <div className="row">
                <button
                  onClick={() => {
                    enterSubScreen()
                    live.current.screen = 'bench'
                    setScreen('bench')
                  }}
                >
                  🧪 그리기 성능 시험 (200개~)
                </button>
                <button onClick={() => setShowSprites((v) => !v)}>{showSprites ? '스프라이트 접기' : '🖼️ 스프라이트 모아 보기'}</button>
              </div>
              {showSprites && <SpriteGallery />}
            </section>
            <section>
              <h3>게임 설정</h3>
              <p className="dim" style={{ margin: '0 0 6px' }}>
                바꾸면 판 계산이 달라짐 (새로고침하면 기본값으로)
              </p>
              <Settings cfg={cfg} onChange={(p) => setCfg({ ...cfg, ...p })} />
            </section>
            <section className="danger-zone">
              <h3>초기화</h3>
              <p className="dim" style={{ margin: '0 0 8px' }}>
                캐릭·스테이지 기록·별·골드·배치를 모두 지우고, 처음 시작할 때 주는 티켓(뽑기 티켓 · 능력치 변경 티켓 · 특수능력 변경 티켓)을 새로 받아요
              </p>
              <button
                className="danger"
                onClick={() =>
                  confirm('정말 모든 데이터를 초기화할까요?\n\n캐릭·스테이지 기록·별·골드가 모두 사라지고\n처음 시작할 때 주는 티켓만 새로 받아요.\n되돌릴 수 없어요.') &&
                  void api.dev?.resetAll().then((a) => {
                    setAccount(a)
                    setSave((s) => ({ ...s, placementsByMap: {} }))
                  })
                }
              >
                🧹 모든 데이터 초기화
              </button>
            </section>
          </>
        )}

        <nav className="tabbar">
          {VISIBLE_TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              <span className="big">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    )
  }

  // ── 탄 준비 · 진행 · 결과 (판이 보이는 화면) ──
  const summary = stageSummary(stage)
  return (
    <div className={`app ${screen === 'prepare' ? 'prepare-view' : 'play-view'}`}>
      {/* 배치 화면은 제목 줄 없이 판부터 (2026-11-28) — 돌아가기·시작은 아래 떠 있는 버튼 */}
      {screen !== 'prepare' && (
      <header className={`play-head ${stageTheme(stageNo)}`}>
        {/* 진행 화면 제목 (2026-11-28 다시 정리): 한 줄 = 탄 이름(왼쪽) · 시간 · 지금 별(오른쪽 끝, 통과할 때마다 하나씩 꺼짐).
            ← 버튼은 없음 — 아래 일시정지 버튼 · 기기 뒤로 가기가 같은 일시정지 창을 엶 */}
        <h1>
          {stageName(stageNo)} {stage.isBoss && <span className="boss-tag">우두머리</span>}
        </h1>
        {/* 오른쪽 묶음: 시간 · 별 (별이 맨 오른쪽 → 시간 자리수가 늘어도 별은 안 움직임, 2026-11-28) */}
        <div className="ph-right">
          <span className="ph-time">⏱ {sim ? (sim.tick / cfg.tickRate).toFixed(1) : '0.0'}초</span>
          {(() => {
            // 지금 별 = 3 − 통과 수 (결과 화면이면 받은 별)
            const now = screen === 'result' && result ? result.stars : Math.max(0, 3 - (sim ? sim.leaked : 0))
            return (
              <span className="ph-stars" title={`지금 별 ${now}개 (1마리 통과할 때마다 하나씩 줄어요)`}>
                {[1, 2, 3].map((k) => (
                  <i key={k} className={k <= now ? 'on' : 'lost'}>
                    ★
                  </i>
                ))}
              </span>
            )
          })()}
        </div>
      </header>
      )}

      {/* 결과 창: 판(고정·z-index 있는 상자) 밖에 둬야 화면 전체(제목까지)를 덮음 (2026-11-28) */}
      {screen === 'result' && result && (
        <ResultOverlay
          cleared={result.cleared}
          stars={result.stars}
          stage={stageNo}
          detail={result.text}
          reward={result.reward ? { ...result.reward, ticket: result.reward.ticket ? TICKET_NAMES[result.reward.ticket] : null } : null}
          onNext={() => openStage(stageNo + 1)}
          onRetry={() => openStage(stageNo)}
          onSelect={goSelect}
        />
      )}
      {askLeave && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-title">⏸ 일시정지</div>
            <p className="dim">스테이지로 가면 지금 하던 판은 사라져요</p>
            <div className="row pause-row">
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
                스테이지로
              </button>
            </div>
          </div>
        </div>
      )}
      <main>
        <div className={`board ${stageTheme(stageNo)}`}>
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
              {/* 일시정지 = 일시정지 창 (계속하기 · 스테이지로). 기기 뒤로 가기·Esc 도 같은 창 (2026-11-28) */}
              <button onClick={askToLeave}>⏸ 일시정지</button>
              {[1, 2, 4].map((s) => (
                <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
          )}
        </div>

        <aside>
          {screen === 'prepare' && (
            <section className="prep-monsters">
              <h3>
                {stageName(stageNo)} {stage.isBoss && <span className="boss-tag">우두머리</span>} 출연 슬라임 <span className="dim">· 눌러서 보기</span>
              </h3>
              {/* 그림 + 마릿수를 가로로, 누르면 능력치·특수능력 (2026-11-28) */}
              <MonsterChips summary={summary} onPick={(spec, count) => setMonsterInfo({ spec, count })} />
            </section>
          )}
          {/* 진행·결과 화면 (2026-11-28): 조작은 일시정지·배속뿐이라 막사 목록 대신 가로 목록 2줄만 → 판을 크게 */}
          {screen !== 'prepare' && (
            <section className="play-info">
              <h3>
                출연 슬라임 <span className="dim">· 맵 {map.name} · 눌러서 보기</span>
              </h3>
              <MonsterChips summary={summary} onPick={(spec, count) => setMonsterInfo({ spec, count })} />
              <h3>
                출전 캐릭 {placedCount}명 <span className="dim">· 눌러서 사거리 보기</span>
              </h3>
              <ul className="unit-chips">
                {roster
                  .filter((u) => placements[u.id])
                  .map((u) => {
                    const look = unitLook(cfg, u)
                    return (
                      <li key={u.id}>
                        <button className={selectedId === u.id ? 'on' : ''} onClick={() => setSelectedId(selectedId === u.id ? null : u.id)} title={look.title}>
                          <UnitFace body={look.body} tool={look.tool} rainbow={look.tier === 6} />
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </section>
          )}

          {screen === 'prepare' && (
          <section>
            {/* 판 바로 아래에 한 번 더 붙음: 출전 수·필터가 목록을 내려도 보이게 (2026-11-28) */}
            <div className="roster-head">
              <h3>
                막사 ({roster.length}명) · 출전 {placedCount} / {cfg.maxDeploy}
              </h3>
              <RosterTools view={view} onChange={setView} roster={roster} />
            </div>
            <ul className="roster">
              {viewRoster(cfg, roster, view).map((u) => {
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
            <p className="hint">캐릭을 고른 뒤 초록 칸을 누르면 배치 · 판 위 캐릭을 고르고 다른 칸을 누르면 이동·자리 바꾸기. 배치는 맵마다 기억됨</p>
          </section>
          )}
        </aside>
      </main>

      {/* 배치 화면 아래 떠 있는 버튼 2개 (2026-11-28) */}
      {screen === 'prepare' && (
        <div className="prep-bar">
          <button onClick={goSelect}>← 스테이지</button>
          <button className="primary" disabled={placedCount === 0} onClick={startStage}>
            ▶ {stageName(stageNo)} 게임 시작
          </button>
        </div>
      )}

      {/* 출연 슬라임 자세히 — 확인만 하는 창이라 가운데 */}
      {monsterInfo && (
        <div className="modal-back" onClick={() => setMonsterInfo(null)}>
          <div className="modal monster-info" onClick={(e) => e.stopPropagation()}>
            <div className="mi-head">
              <UnitFace body={monsterSprite(monsterInfo.spec)} tool={null} big />
              <b>{monsterInfo.spec.name}</b>
            </div>
            {/* 능력치 한 줄 + 특수능력은 도감과 같은 박스 (이름 · 설명 · 다음 줄 보충) */}
            <p className="mi-stats">
              체력 {Math.max(1, Math.floor((monsterInfo.spec.hp * cfg.monsterHpBp) / 10000))} · 방어 {monsterInfo.spec.armor} · 민첩 {monsterInfo.spec.agility} · 속도{' '}
              {((monsterInfo.spec.speed * cfg.monsterSpeedBp) / 10000 / 1000).toFixed(1)}칸/초
            </p>
            {monsterInfo.spec.abilities.length === 0 && <p className="dim">특수능력 없음</p>}
            {monsterInfo.spec.abilities.map((k) => {
              const d = MONSTER_ABILITIES[k]
              const { main, notes } = splitDesc(d.name, monsterAbilityDesc(k, monsterInfo.spec))
              return (
                <div key={k} className="ab mi-ab">
                  <b className="ab-name">
                    {d.icon} {d.name}
                  </b>
                  <span className="ab-desc">{main}</span>
                  {notes.length > 0 && <span className="ab-note">{notes.join(' · ')}</span>}
                </div>
              )
            })}
            <div className="row end">
              <button className="primary inline" onClick={() => setMonsterInfo(null)}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 아래 고정 메뉴 (막사 · 스테이지 · 상점, 가운데 스테이지) */
type Tab = 'barracks' | 'stages' | 'shop' | 'settings' | 'dev'
/**
 * 개발자 메뉴 (2026-11-28): 시험용 기능(모든 탄 열기·기록 지우기·티켓 지급·막사 다시 뽑기·성능 시험·스프라이트·게임 설정)을 한 탭에.
 * 주소 끝이 /dev 일 때만 아래 메뉴에 "개발자" 탭이 뜸 (예: https://주소/dev). 평소 주소에선 탭도 "모든 탄 열기"도 꺼짐.
 * 주의: 이건 숨김일 뿐 보안이 아님 — 서버를 붙이면 티켓 지급 같은 개발 기능은 서버 api 에 아예 없어야 함
 */
const SHOW_DEV_MENU = /\/dev\/?$/.test(window.location.pathname)
/** 아래 메뉴 높이 (지도가 1탄 아래로 이만큼 더 이어져 메뉴 밑까지 풀밭·길) */
const TABBAR_SPACE = 80
/** 지도에서 깬 탄 위로 미리 보여 주는 무한 탄 수 (잠긴 채) */
const INFINITE_PREVIEW = 3
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'barracks', icon: '⛺', label: '막사' },
  { id: 'stages', icon: '⚔️', label: '스테이지' },
  { id: 'shop', icon: '🛒', label: '상점' },
  { id: 'settings', icon: '⚙️', label: '설정' },
  { id: 'dev', icon: '🛠', label: '개발자' },
]
const VISIBLE_TABS = TABS.filter((t) => t.id !== 'dev' || SHOW_DEV_MENU)
const TAB_TITLES: Record<Tab, string> = { barracks: '막사', stages: '스테이지', shop: '상점', settings: '설정', dev: '개발자' }
/** 막사에서 할 일 (아직 준비 중) */
const BARRACKS_ACTIONS = [
  { icon: '🎟️', label: '캐릭 뽑기' },
  { icon: '🔄', label: '능력치 변경' },
  { icon: '✨', label: '특수능력 변경' },
  { icon: '🧪', label: '합성' },
]
/** 상점 물건 (값은 엔진 SHOP_PRICES, 2026-11-28 *임시*) */
const SHOP_ITEMS: { kind: TicketKind; icon: string; desc: string }[] = [
  { kind: 'statNormal', icon: '🔄', desc: '능력치 4개 모두 다시' },
  { kind: 'draw', icon: '🎟️', desc: '캐릭 1명 뽑기' },
  { kind: 'statHigh', icon: '🔄', desc: '1개 골라 유지, 나머지 다시' },
  { kind: 'ability', icon: '✨', desc: '특수능력만 다시' },
  { kind: 'statTop', icon: '🔄', desc: '2개 골라 유지, 나머지 다시' },
]

/** 출연 슬라임 가로 목록 (그림 + 마릿수, 누르면 자세히) — 배치·진행 화면 공용 (2026-11-28) */
function MonsterChips({ summary, onPick }: { summary: { spec: MonsterSpec; count: number }[]; onPick: (spec: MonsterSpec, count: number) => void }) {
  return (
    <ul className="monster-chips">
      {summary.map(({ spec, count }) => (
        <li key={spec.id}>
          <button onClick={() => onPick(spec, count)} title={spec.name}>
            <UnitFace body={monsterSprite(spec)} tool={null} />
            {/* 마릿수 = 오른쪽 위 뱃지 (막사 권 버튼과 같은 모양, 2026-11-28) */}
            <span className="badge">{count}</span>
            {spec.abilities.length > 0 && <i className="chip-ab">{spec.abilities.map((a) => MONSTER_ABILITIES[a].icon).join('')}</i>}
          </button>
        </li>
      ))}
    </ul>
  )
}

function MonsterRow({ spec, count, cfg }: { spec: MonsterSpec; /** 없으면 마릿수 안 씀 (자세히 창) */ count?: number; cfg: DefenseConfig }) {
  const hp = Math.max(1, Math.floor((spec.hp * cfg.monsterHpBp) / 10000))
  const speed = (spec.speed * cfg.monsterSpeedBp) / 10000 / 1000
  return (
    <li>
      <div>
        <i className="dot" style={{ background: spec.color }} />
        <b>{spec.name}</b>
        {count !== undefined && ` ×${count}`}
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
      {num('슬라임 속도 (%)', cfg.monsterSpeedBp / 100, (v) => ({ monsterSpeedBp: Math.max(10, v) * 100 }), 10, 10)}
      {num('슬라임 체력 (%)', cfg.monsterHpBp / 100, (v) => ({ monsterHpBp: Math.max(10, v) * 100 }), 10, 10)}
      {num('몇 마리 통과하면 실패', cfg.startLives, (v) => ({ startLives: Math.max(1, v) }), 1, 1)}
      {num('특수능력 확률 (%)', cfg.abilityChanceBp / 100, (v) => ({ abilityChanceBp: Math.min(100, v) * 100 }), 10)}
      <button onClick={() => onChange({ ...DEFAULT_CONFIG })}>기본값으로</button>
      <p className="dim" style={{ gridColumn: '1 / -1', margin: 0 }}>
        능력치 범위를 바꾸면 캐릭이 다시 뽑힙니다 (같은 씨앗이라도 숫자가 달라짐).
      </p>
    </div>
  )
}
