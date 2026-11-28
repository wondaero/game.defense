import { showAlert, showConfirm } from './dialog.tsx'
import { BackButton, Icon, ICON_NAMES, MonAbIcon, type IconName } from './Icon.tsx'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  attackCellCount,
  smartPlace,
  RESIST_POWER,
  STAT_TIERS,
  pierceLine,
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
import { ResultOverlay } from './ResultOverlay.tsx'
import { usePwa } from './pwa.ts'
import { bgm, getSoundPrefs, setSoundPrefs, sfx, unlockAudio, type SoundPrefs } from './sound.ts'
import { StageMap } from './StageMap.tsx'
import { unitLook, stageName, stageTheme } from './format.ts'
import { RosterTools, splitDesc, UnitFace, UnitRow, viewRoster, type RosterView } from './UnitList.tsx'
import { Barracks } from './Barracks.tsx'
import type { DevSnapshot, GameApi } from './api/api.ts'
import { createLocalApi } from './api/localApi.ts'

// 자주 안 쓰는 화면은 따로 받음 (2026-11-28 최적화): 성능 시험 · 스프라이트 모아 보기 · 도감 → 첫 화면이 가벼워짐
const Bench = lazy(() => import('./Bench.tsx').then((m) => ({ default: m.Bench })))
const Codex = lazy(() => import('./Codex.tsx').then((m) => ({ default: m.Codex })))
const SpriteGallery = lazy(() => import('./SpriteGallery.tsx').then((m) => ({ default: m.SpriteGallery })))

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
  // 개발자 모드 (메모리에만): [끄기]를 누르거나 새로고침·탭 닫기·앱 다시 열기로 꺼짐 (시간 제한 없음, 2026-11-29 사용자)
  const [devOn, setDevOn] = useState(false)
  const [devAsk, setDevAsk] = useState(false)
  const visibleTabs = TABS.filter((t) => t.id !== 'dev' || devOn)
  const [shopTab, setShopTab] = useState<'shop' | 'trade'>('shop')
  /** 개발자 탭: 스프라이트 모아 보기 펼침 */
  const [showSprites, setShowSprites] = useState(false)
  const [save, setSave] = useState<Save>(loadSave)
  // 계정 창구: 지금은 브라우저 안(localApi), 서버를 붙이면 serverApi 로 바꿈 (화면 코드는 그대로)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  // 개발자 메뉴를 숨기면 "모든 탄 열기"도 저장값과 상관없이 꺼짐
  const unlockAll = devOn && save.unlockAll
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
  /** 배치 화면 "모두 빼기" 확인 창 */
  const [askClear, setAskClear] = useState(false)
  /** 배치 화면 "자동 배치" 확인 창 */
  const [askAuto, setAskAuto] = useState(false)
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
  /** 우두머리가 판에 있는지 (곡 바꾸기용) */
  const bossOnRef = useRef(false)
  /**
   * 결정적 순간 연출 (2026-11-29): 우두머리 처치 · 마지막 슬라임 처치(클리어) · 3번째 통과(실패) 때
   * 그 자리로 확대 + 슬로우 (배속과 상관없이 기본 속도 기준). 화면을 누르면 바로 넘김. 결과(엔진)는 이미 정해진 뒤라 판정엔 영향 없음
   */
  const finaleRef = useRef<{ start: number; endTick: number; x: number; y: number; tailFrom: number | null } | null>(null)
  /** 판을 다시 만들 재료 (엔진이 결정적 → 같은 재료·씨앗이면 같은 판). 연출 때 1초 앞으로 되감는 데 씀 */
  const replayRef = useRef<Parameters<typeof createWave> | null>(null)
  /** 화면 시간(효과·애니메이션용): 연출 중엔 느리게 흐름 */
  const vNowRef = useRef(performance.now())
  /** 연출 중 느리게 흐른 시간만큼 애니메이션 시계에 더함 */
  const clockOffRef = useRef(0)
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
    const loop = (realNow: number) => {
      const L = live.current
      const dt = Math.min(250, realNow - last)
      last = realNow
      const sim = simRef.current
      const tickMs = 1000 / L.cfg.tickRate
      // 연출 (2026-11-29): 결정적 순간 1초 전으로 되감아 그 1초를 FINALE_SLOW 배(기본 속도 기준, 1초 → 3초)로 다시 보여 줌
      //   + 끝난 뒤 FINALE_TAIL_MS 동안 쓰러지는 모습을 느리게, 그다음 원래 크기로 돌아오며 결과
      const fin = finaleRef.current
      const finAge = fin ? realNow - fin.start : 0
      const total = FINALE_REPLAY_MS / FINALE_SLOW + FINALE_TAIL_MS
      const finT = fin ? Math.min(1, finAge / total) : 0
      const zin = 600 / total
      const zout = 1 - 450 / total
      const env = !fin ? 0 : finT < zin ? finT / zin : finT < zout ? 1 : Math.max(0, 1 - (finT - zout) / (1 - zout))
      const ease = env * env * (3 - 2 * env)
      const rate = fin ? FINALE_SLOW : 1
      vNowRef.current += dt * rate
      const now = vNowRef.current
      if (fin && sim) {
        if (sim.tick < fin.endTick) {
          // 되감은 1초를 느리게 진행
          accRef.current += dt * FINALE_SLOW
          while (accRef.current >= tickMs && sim.tick < fin.endTick) {
            accRef.current -= tickMs
            stepWave(sim)
            collectFx(sim, now)
          }
        } else {
          if (fin.tailFrom == null) fin.tailFrom = realNow
          clockOffRef.current += dt * FINALE_SLOW
        }
        if (finT >= 1) {
          finaleRef.current = null
          accRef.current = 0
          if (sim.done) finishStage(sim)
        }
      } else if (sim && !sim.done && !L.paused && L.screen === 'play') {
        accRef.current += dt * L.speed
        while (accRef.current >= tickMs && !sim.done) {
          accRef.current -= tickMs
          stepWave(sim)
          collectFx(sim, now)
          // 결정적 순간이면: 같은 재료로 판을 새로 만들어 1초 전까지 돌려 둠 → 그 1초를 느리게 다시
          const f = getSoundPrefs().replay ? finaleSpot(sim) : null
          if (f && replayRef.current) {
            const endTick = sim.tick
            const fresh = createWave(...replayRef.current)
            const from = Math.max(0, endTick - Math.round((FINALE_REPLAY_MS / 1000) * L.cfg.tickRate))
            while (fresh.tick < from && !fresh.done) stepWave(fresh)
            simRef.current = fresh
            animRef.current = newAnimState()
            fxRef.current = []
            clockOffRef.current = 0
            accRef.current = 0
            finaleRef.current = { start: realNow, endTick, ...f, tailFrom: null }
            break
          }
        }
        // 우두머리 곡 (2026-11-28): 우두머리가 판에 나오면 우두머리 곡 + 등장음, 죽거나 통과해서 판에서 사라지면 평소 곡
        const bossOn = sim.monsters.some((m) => m.spec.id === 'boss')
        if (bossOn !== bossOnRef.current) {
          bossOnRef.current = bossOn
          if (bossOn) sfx.bossAppear()
          bgm.setTrack(bossOn ? 'boss' : 'peace')
        }
        if (sim.done && !finaleRef.current) finishStage(sim)
      }
      if (now - lastUi > 100) {
        lastUi = now
        setUiTick((t) => t + 1)
      }
      fxRef.current = fxRef.current.filter((f) => now - f.born < f.life)
      // (now = 화면 시간: 연출 중엔 느리게)
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
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
      // 연출 확대: 그 자리를 중심으로 최대 FINALE_ZOOM 배 (판 좌표 + 여백 PAD)
      if (fin && ease > 0) {
        const z = 1 + (FINALE_ZOOM - 1) * ease
        const fx = fin.x + PAD
        const fy = fin.y + PAD
        ctx.translate(fx, fy)
        ctx.scale(z, z)
        ctx.translate(-fx, -fy)
      }
      const s = L.screen === 'prepare' ? null : simRef.current
      const anim = animRef.current
      // 애니메이션 시계: 진행 중엔 게임 시간(일시정지·배속 따라감), 준비 화면은 실제 시간
      anim.clock = s ? (s.tick - 1 + (s.done ? 1 : Math.min(1, accRef.current / tickMs))) * tickMs + clockOffRef.current : now
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
      // 연출 중 가장자리를 살짝 어둡게
      if (fin && ease > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        const cw = canvas.width
        const ch = canvas.height
        const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.7)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, `rgba(0,0,0,${0.45 * ease})`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, cw, ch)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBoard])

  /** 이번 틱이 결정적 순간인지: 판 좌표 자리 or null. 우두머리 처치는 판마다 한 번 */
  function finaleSpot(sim: WaveSim): { x: number; y: number } | null {
    const { map } = live.current
    const exit = () => {
      const e = map.path.at(-1)!
      return { x: (e.x + 0.5) * CELL_PX, y: (e.y + 0.5) * CELL_PX }
    }
    const kills = sim.events.filter((e) => e.type === 'kill') as Extract<WaveSim['events'][number], { type: 'kill' }>[]
    const at = (k: (typeof kills)[number]) => monsterScreenPos(map, k.dist, k.monsterId)
    if (sim.done) {
      if (sim.lives > 0) {
        const k = kills.at(-1)
        return k ? at(k) : exit()
      }
      return exit()
    }
    const boss = kills.find((k) => sim.stage.monsters[k.monsterType]?.id === 'boss')
    return boss ? at(boss) : null
  }

  function collectFx(sim: WaveSim, now: number) {
    const { map, cfg } = live.current
    const anim = animRef.current
    const at = (sim.tick - 1) * (1000 / cfg.tickRate)
    const unitPos = (id: string) => {
      const u = sim.units.find((x) => x.inst.id === id)
      return u ? { x: (u.cell.x + 0.5) * CELL_PX, y: (u.cell.y + 0.5) * CELL_PX } : null
    }
    for (const ev of sim.events) {
      // 효과음 (2026-11-28): 맞을 때만(때리는 순간·빗나감은 소리 없음) + 처치·특수능력·통과
      if (ev.type === 'hit') ev.crit ? sfx.crit() : sfx.hit()
      else if (ev.type === 'kill') sim.stage.monsters[ev.monsterType]?.id === 'boss' ? sfx.bossDown() : sfx.kill()
      else if (ev.type === 'proc') {
        if (ev.kind === 'lullaby') {
          // 자장가: 배경음을 잠깐 끄고 오르골 자장가 + 판 가득 음표 (2026-11-28)
          bgm.duck(2600)
          sfx.lullaby()
        } else sfx.proc()
      }
      else if (ev.type === 'leak') sfx.leak()
      if (ev.type === 'proc') {
        fxRef.current.push({ kind: 'text', born: now, life: 900, to: { ...monsterScreenPos(map, ev.dist, ev.monsterId), y: monsterScreenPos(map, ev.dist, ev.monsterId).y - 14 }, text: ABILITY_NAMES[ev.kind] + '!', color: '#ffeb3b' })
        const p = unitPos(ev.unitId)
        if (p) fxRef.current.push({ kind: 'skill', born: now, life: 500, to: p, color: '#ffeb3b' })
        if (ev.kind === 'lullaby' && p) fxRef.current.push({ kind: 'notes', born: now, life: 2400, to: p })
        if (ev.kind === 'pierce') {
          // 관통: 캐릭 → 줄 끝 칸 중심까지 레이저 (엔진과 같은 pierceLine 으로 줄을 구함)
          const su = sim.units.find((x) => x.inst.id === ev.unitId)
          const line = su ? pierceLine(map, su.cell, map.path[pathIndexAt(map, ev.dist)]!) : []
          const end = line[line.length - 1]
          if (p && end) {
            const dx = end.x - su!.cell.x
            const dy = end.y - su!.cell.y
            const len = Math.hypot(dx, dy) || 1
            // 줄 끝 칸 가장자리까지 조금 더 뻗게
            const to = { x: (end.x + 0.5 + (dx / len) * 0.45) * CELL_PX, y: (end.y + 0.5 + (dy / len) * 0.45) * CELL_PX }
            fxRef.current.push({ kind: 'beam', born: now, life: 380, from: p, to })
          }
        }
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
      if (r.cleared) sfx.clear()
      else sfx.fail()
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
      .catch((e: unknown) => show(mine, ` · 기록 안 됨: ${e instanceof Error ? e.message : String(e)}`))
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
    replayRef.current = [cfg, map, stage, roster, placements, cfg.startLives, seed]
    simRef.current = createWave(...replayRef.current)
    animRef.current = newAnimState()
    accRef.current = 0
    finaleRef.current = null
    clockOffRef.current = 0
    fxRef.current = []
    setSelectedId(null)
    setPaused(false)
    live.current.screen = 'play'
    setScreen('play')
  }

  const placedCount = Object.keys(placements).length

  // 곡 (2026-11-28): 게임 진행 = 게임 곡(우두머리 나오면 우두머리 곡), 그 밖(메뉴·배치·결과) = 마을 곡
  useEffect(() => {
    if (screen === 'play') bgm.setTrack('peace')
    else {
      bossOnRef.current = false
      bgm.setTrack('town')
    }
  }, [screen])

  // 소리: 브라우저는 사용자가 한 번 눌러야 소리를 허락함 → 첫 터치·클릭·키 때 켬 (배경음도 그때 시작)
  useEffect(() => {
    const on = () => unlockAudio()
    window.addEventListener('pointerdown', on)
    window.addEventListener('keydown', on)
    return () => {
      window.removeEventListener('pointerdown', on)
      window.removeEventListener('keydown', on)
    }
  }, [])

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
    // 연출 중 누르면 바로 넘김
    if (finaleRef.current) {
      finaleRef.current.start = -1e9
      return
    }
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

  if (screen === 'bench')
    return (
      <Suspense fallback={null}>
        <Bench onBack={goSelect} />
      </Suspense>
    )

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
              <span className="gold-pill">
                <Icon name="coin" /> {account?.gold ?? 0}
              </span>
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
                        <span className="big">
                          <Icon name={it.icon} />
                        </span>
                        <div>
                          <b>{TICKET_NAMES[it.kind]}</b>
                          <div className="dim">{it.desc}</div>
                          <div className="have">{have}장 보유</div>
                        </div>
                        <button
                          className="buy"
                          disabled={gold < price}
                          onClick={() =>
                            void api
                              .barracks({ type: 'buy', kind: it.kind })
                              .then(({ account: a }) => setAccount(a))
                              .catch((e: unknown) => void showAlert(e instanceof Error ? e.message : String(e)))
                          }
                        >
                          <Icon name="coin" /> {price}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p className="dim">다른 사람과 병사를 주고받는 곳 (서버를 붙인 뒤 만듦, 준비 중)</p>
            )}
          </section>
        )}

        {/* 설정 (2026-11-28): 소리 · 도감 메뉴. 나중에 계정 등 */}
        {tab === 'settings' && <SettingsPage cfg={cfg} onSecret={() => setDevAsk(true)} />}

        {/* 개발자 메뉴: 이스터에그 + 코드로 켬 (devOn, 아래 DEV_* 설명) */}
        {tab === 'dev' && devOn && (
          <>
            <section className="dev-status">
              <span>
                <Icon name="wrench" /> <b>개발자 모드 켜짐</b>
              </span>
              <button
                onClick={() => {
                  setDevOn(false)
                  setTab('settings')
                }}
              >
                개발자 모드 끄기
              </button>
            </section>
            <section>
              <h3>진행</h3>
              <div className="row">
                <label>
                  <input type="checkbox" checked={save.unlockAll} onChange={(e) => setSave({ ...save, unlockAll: e.target.checked })} /> 모든 탄 열기
                </label>
                <button onClick={() => void showConfirm({ title: '기록 지우기', message: '최고 기록을 0으로 되돌릴까요?', ok: '지우기', danger: true }).then((y) => {
                  if (y) void api.dev?.setBest(0).then(setAccount)
                })}>기록 지우기</button>
              </div>
            </section>
            <section>
              <h3>막사</h3>
              <div className="row">
                <button onClick={() => void api.dev?.grantTickets(5).then(setAccount)}>
                  <Icon name="ticket" /> 티켓 모두 +5
                </button>
                <button
                  onClick={() =>
                    void showConfirm({ title: '막사 다시 뽑기', message: '막사 병사를 모두 새로 뽑을까요? 배치도 지워져요.', ok: '다시 뽑기', danger: true }).then((y) => void (y && api.dev?.resetBarracks(`시험판-${Math.floor(Math.random() * 1e6)}`).then((a) => {
                      setAccount(a)
                      setSave((s) => ({ ...s, placementsByMap: {} }))
                    })))
                  }
                >
                  <Icon name="dice" /> 막사 전체 다시 뽑기
                </button>
              </div>
            </section>
            <section>
              <h3>소리 들어보기</h3>
              <p className="dim" style={{ margin: '0 0 6px' }}>
                파일 없이 그 자리에서 만든 소리 (sound.ts). 효과음은 게임에서 맞을 때·처치·특수능력·통과·끝날 때 남
              </p>
              <div className="row sound-test">
                <button onClick={() => (bgm.playing ? bgm.stop() : (unlockAudio(), bgm.start()))}>
                  <Icon name="music" /> 배경음 켜기/끄기
                </button>
                <button
                  onClick={() => {
                    unlockAudio()
                    bgm.setTrack(bgm.track === 'town' ? 'peace' : bgm.track === 'peace' ? 'boss' : 'town')
                  }}
                >
                  <Icon name="notes" /> 곡 넘기기 (마을 → 게임 → 우두머리)
                </button>
                {(
                  [
                    ['맞음', sfx.hit],
                    ['치명타', sfx.crit],
                    ['처치', sfx.kill],
                    ['특수능력', sfx.proc],
                    ['통과', sfx.leak],
                    ['클리어', sfx.clear],
                    ['실패', sfx.fail],
                    ['우두머리 등장', sfx.bossAppear],
                    ['우두머리 처치', sfx.bossDown],
                    ['자장가', () => (bgm.duck(2600), sfx.lullaby())],
                  ] as const
                ).map(([name, play]) => (
                  <button
                    key={name}
                    onClick={() => {
                      unlockAudio()
                      play()
                    }}
                  >
                    <Icon name="speaker" /> {name}
                  </button>
                ))}
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
                  <Icon name="test" /> 그리기 성능 시험 (200개~)
                </button>
                <button onClick={() => setShowSprites((v) => !v)}>{showSprites ? '스프라이트 접기' : <><Icon name="picture" /> 스프라이트 모아 보기</>}</button>
              </div>
              {showSprites && (
                <Suspense fallback={<p className="dim">불러오는 중…</p>}>
                  <SpriteGallery />
                </Suspense>
              )}
              {/* 아이콘 모아 보기 (2026-11-28): 이모지 대신 그린 SVG 전부 */}
              <div className="icon-gallery">
                {ICON_NAMES.map((n) => (
                  <span key={n}>
                    <Icon name={n} size={32} />
                    <small>{n}</small>
                  </span>
                ))}
              </div>
            </section>
            <section>
              <h3>게임 설정</h3>
              <p className="dim" style={{ margin: '0 0 6px' }}>
                바꾸면 판 계산이 달라짐 (새로고침하면 기본값으로)
              </p>
              <Settings cfg={cfg} onChange={(p) => setCfg({ ...cfg, ...p })} />
            </section>
            <DevSnapshots api={api} />
            <section className="danger-zone">
              <h3>초기화</h3>
              <p className="dim" style={{ margin: '0 0 8px' }}>
                병사·스테이지 기록·별·골드·배치를 모두 지우고, 처음 시작할 때 주는 티켓(뽑기 티켓 · 능력치 변경 티켓 · 특수능력 변경 티켓)을 새로 받아요
              </p>
              <button
                className="danger"
                onClick={() =>
                  void showConfirm({
                    title: '모든 데이터 초기화',
                    message: '병사·스테이지 기록·별·골드가 모두 사라지고, 처음 시작할 때 주는 티켓만 새로 받아요. 되돌릴 수 없어요.',
                    ok: '초기화',
                    danger: true,
                  }).then((y) => {
                    if (y)
                      void api.dev?.resetAll().then((a) => {
                        setAccount(a)
                        setSave((s) => ({ ...s, placementsByMap: {} }))
                      })
                  })
                }
              >
                <Icon name="broom" /> 모든 데이터 초기화
              </button>
            </section>
          </>
        )}

        <nav className="tabbar">
          {visibleTabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              <span className="big">
                <Icon name={t.icon} />
              </span>
              {t.label}
            </button>
          ))}
        </nav>
        {devAsk && (
          <DevCodeModal
            onClose={() => setDevAsk(false)}
            onOk={() => {
              setDevAsk(false)
              setDevOn(true)
              setTab('dev')
            }}
          />
        )}
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
          <span className="ph-time">
            <Icon name="timer" /> {sim ? (sim.tick / cfg.tickRate).toFixed(1) : '0.0'}초</span>
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
      {/* 자동 배치 확인 (2026-11-28) */}
      {askAuto && (
        <div className="modal-backdrop" onClick={() => setAskAuto(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">자동 배치할까요?</div>
            <ul className="auto-explain">
              <li>능력치 점수가 높은 병사 {cfg.maxDeploy}명을 골라요 (특수능력은 안 봐요)</li>
              <li>길이 꺾이는 코너 자리부터 먼저 채우고, 그다음 공격 칸이 많은 자리에 놓아요</li>
            </ul>
            {placedCount > 0 && <p className="warn-line">지금 배치({placedCount}명)는 지워지고 새로 배치돼요</p>}
            <div className="row pause-row">
              <button onClick={() => setAskAuto(false)}>취소</button>
              <button
                className="primary inline"
                onClick={() => {
                  setPlacements(smartPlace(cfg, map, roster, {}))
                  setSelectedId(null)
                  setAskAuto(false)
                }}
              >
                자동 배치
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 모두 빼기 확인 (2026-11-28): 확인만 하는 창이라 가운데 */}
      {askClear && (
        <div className="modal-backdrop" onClick={() => setAskClear(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">모두 뺄까요?</div>
            <p>
              출전한 병사 {placedCount}명을 판에서 모두 빼요
              <br />
              <span className="dim">이 맵의 배치가 지워져요</span>
            </p>
            <div className="row pause-row">
              <button onClick={() => setAskClear(false)}>취소</button>
              <button
                className="danger"
                onClick={() => {
                  setPlacements({})
                  setSelectedId(null)
                  setAskClear(false)
                }}
              >
                모두 빼기
              </button>
            </div>
          </div>
        </div>
      )}
      {askLeave && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-title">
              <Icon name="pause" /> 일시정지
            </div>
            {/* 일시정지 창에서도 소리 켜기/끄기·크기 (2026-11-28, 설정과 같은 값) */}
            <SoundSettings compact />
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
              <button onClick={askToLeave}>
                <Icon name="pause" /> 일시정지
              </button>
              {[1, 2, 4].map((s) => (
                <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
                  ×{s}
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
                출전 병사 {placedCount}명 <span className="dim">· 눌러서 사거리 보기</span>
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
              <div className="roster-head-top">
                {/* 출전 현황 (2026-11-29): "출전 n / 10" (칸 막대는 사용자 요청으로 뺌) — 막사 인원은 아래 보기 칸(전체 n)에 있어서 뺌 */}
                <div className={`deploy-meter ${placedCount >= cfg.maxDeploy ? 'full' : ''}`} aria-label={`출전 ${placedCount} / ${cfg.maxDeploy}`}>
                  <span className="dm-label">
                    출전 <b>{placedCount}</b>
                    <small> / {cfg.maxDeploy}</small>
                  </span>
                </div>
                {/* 자동 배치(기존 배치 지우고 새로, 능력치 점수 순 · 코너 먼저) · 모두 빼기 — 둘 다 확인 창 (2026-11-28) */}
                <div className="place-tools">
                  <button disabled={roster.length === 0} onClick={() => setAskAuto(true)}>
                    자동 배치
                  </button>
                  <button disabled={placedCount === 0} onClick={() => setAskClear(true)}>
                    모두 빼기
                  </button>
                </div>
              </div>
              <RosterTools view={view} onChange={setView} roster={roster} />
            </div>
            {roster.length === 0 && (
              <p className="empty-note">
                병사가 없어요.
                <br />
                <button className="link" onClick={() => { setTab('barracks'); goSelect() }}>막사</button>에서 뽑기 티켓으로 병사를 뽑아 오세요.
              </p>
            )}
            <ul className="roster">
              {viewRoster(cfg, roster, view).map((u) => {
                const placed = !!placements[u.id]
                return (
                  <UnitRow
                    key={u.id}
                    u={u}
                    cfg={cfg}
                    stacked
                    // 배치한 캐릭: 사거리 안에 들어오는 길 칸 수 (자리 고를 때 참고, 2026-11-28)
                    note={placements[u.id] ? `공격 칸 ${attackCellCount(cfg, map, placements[u.id]!, u)}` : undefined}
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
            <p className="hint">병사를 고른 뒤 초록 칸을 누르면 배치 · 판 위 병사를 고르고 다른 칸을 누르면 이동·자리 바꾸기. 배치는 맵마다 기억됨</p>
          </section>
          )}
        </aside>
      </main>

      {/* 배치 화면 아래 떠 있는 버튼 2개 (2026-11-28) */}
      {screen === 'prepare' && (
        <div className="prep-bar">
          <button className="back-btn big" onClick={goSelect}>
            <Icon name="back" size="1em" />
            스테이지
          </button>
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
            {/* 능력치 = 캐릭 목록과 같은 꼬리표 (2026-11-28) */}
            <div className="stat-tags mi-stats">
              <span>
                체력 <b>{Math.max(1, Math.floor((monsterInfo.spec.hp * cfg.monsterHpBp) / 10000))}</b>
              </span>
              <span>
                방어 <b>{monsterInfo.spec.armor}</b>
              </span>
              <span>
                민첩 <b>{monsterInfo.spec.agility}</b>
              </span>
              <span>
                속도 <b>{((monsterInfo.spec.speed * cfg.monsterSpeedBp) / 10000 / 1000).toFixed(1)}</b>칸/초
              </span>
            </div>
            {monsterInfo.spec.abilities.length === 0 && <p className="dim">특수능력 없음</p>}
            {monsterInfo.spec.abilities.map((k) => {
              const d = MONSTER_ABILITIES[k]
              const { main, notes } = splitDesc(d.name, monsterAbilityDesc(k, monsterInfo.spec))
              return (
                <div key={k} className="ab mi-ab">
                  <b className="ab-name">
                    <MonAbIcon kind={k} size={18} /> {d.name}
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
 * 개발자 모드 (2026-11-29 이스터에그):
 * - 설정 탭 "정보" 제목을 빠르게 7번 누르면 코드 입력 창
 * - 코드 = <달 영문 첫 글자><시 00~23><분 두 자리를 거꾸로>, 예) 11월 13시 59분 → n1395. 외운 시각부터 2분까지 허용 (외우는 사이 분이 바뀌어도 통과, 2026-11-29)
 * - 꺼지는 때: 개발자 탭 [개발자 모드 끄기] · 새로고침 · 탭 닫기 · 앱 다시 열기 (기억 안 함, 시간 제한 없음)
 * - 주소(URL)에는 아무것도 안 남김 → 방문 기록으로 다시 못 들어옴, 설치한 앱(주소창 없음)에서도 됨
 * 주의: 숨김일 뿐 보안이 아님(코드에 규칙이 보임) — 서버를 붙이면 개발 기능은 서버 api 에 아예 없어야 함
 */
/** 결정적 순간 연출: 길이(실제 시간) · 최대 확대 · 느린 배율 (*임시*) */
const FINALE_REPLAY_MS = 1000
const FINALE_TAIL_MS = 900
const FINALE_ZOOM = 2
const FINALE_SLOW = 1 / 3
const DEV_CODE_GRACE_MIN = 2
const DEV_TAPS = 7
function devCodeOk(given: string): boolean {
  const MONTH = 'jfmamjjasond' // 1~12월 영문 첫 글자
  const p2 = (n: number) => String(n).padStart(2, '0')
  const code = (d: Date) => `${MONTH[d.getMonth()]}${p2(d.getHours())}${p2(d.getMinutes()).split('').reverse().join('')}`
  const g = given.trim().toLowerCase()
  const now = Date.now()
  for (let m = 0; m <= DEV_CODE_GRACE_MIN; m++) if (g === code(new Date(now - m * 60_000))) return true
  return false
}
try {
  sessionStorage.removeItem('defense.dev.v1') // 예전 방식 흔적
} catch {
  /* 무시 */
}
/** 아래 메뉴 높이 (지도가 1탄 아래로 이만큼 더 이어져 메뉴 밑까지 풀밭·길) */
const TABBAR_SPACE = 80
/** 지도에서 깬 탄 위로 미리 보여 주는 무한 탄 수 (잠긴 채) */
const INFINITE_PREVIEW = 3
const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'barracks', icon: 'tent', label: '막사' },
  { id: 'stages', icon: 'road', label: '스테이지' },
  { id: 'shop', icon: 'cart', label: '상점' },
  { id: 'settings', icon: 'gear', label: '설정' },
  { id: 'dev', icon: 'wrench', label: '개발자' },
]
const TAB_TITLES: Record<Tab, string> = { barracks: '막사', stages: '스테이지', shop: '상점', settings: '설정', dev: '개발자' }
/** 막사에서 할 일 (아직 준비 중) */
const BARRACKS_ACTIONS = [
  { icon: '🎟️', label: '병사 뽑기' },
  { icon: '🔄', label: '능력치 변경' },
  { icon: '✨', label: '특수능력 변경' },
  { icon: '🧪', label: '합성' },
]
/** 상점 물건 (값은 엔진 SHOP_PRICES, 2026-11-28 *임시*) */
const SHOP_ITEMS: { kind: TicketKind; icon: IconName; desc: string }[] = [
  { kind: 'statNormal', icon: 'rerollBronze', desc: '능력치 4개 모두 다시' },
  { kind: 'draw', icon: 'ticket', desc: '병사 1명 뽑기' },
  { kind: 'statHigh', icon: 'rerollSilver', desc: '1개 골라 유지, 나머지 다시' },
  { kind: 'ability', icon: 'sparkle', desc: '특수능력만 다시' },
  { kind: 'statTop', icon: 'rerollGold', desc: '2개 골라 유지, 나머지 다시' },
  { kind: 'abilityGrant', icon: 'gift', desc: '특수능력 없는 병사에 하나 붙임' },
]

/**
 * 개발자: 지금 상태 저장 · 불러오기 (2026-11-28) — 시험(티켓 잔뜩 등) 전에 진짜 진행을 저장해 두고 나중에 되돌림.
 * 캐릭·티켓·스테이지 기록·별·골드·맵별 배치를 통째로. 불러오면 새로 고침
 */
function DevSnapshots({ api }: { api: GameApi }) {
  const [list, setList] = useState<DevSnapshot[]>(() => api.dev?.snapshots() ?? [])
  const [ask, setAsk] = useState<DevSnapshot | null>(null)
  if (!api.dev) return null
  const fmt = (iso: string) => {
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
  return (
    <section className="dev-snaps">
      <h3>상태 저장</h3>
      <p className="dim" style={{ margin: '0 0 8px' }}>
        병사 · 티켓 · 스테이지 기록 · 별 · 골드 · 배치를 통째로 저장해요 (이 기기, 최대 10개)
      </p>
      <button className="primary inline" onClick={() => setList(api.dev!.saveSnapshot(`저장 ${list.length + 1}`))}>
        지금 상태 저장
      </button>
      {list.length === 0 ? (
        <p className="dim" style={{ margin: '8px 0 0' }}>
          아직 저장한 상태가 없어요
        </p>
      ) : (
        <ul className="snap-list">
          {list.map((s) => (
            <li key={s.id}>
              <div className="snap-info">
                <b>{fmt(s.at)}</b>
                <small className="dim">
                  병사 {s.summary.units} · {s.summary.best}탄 · 골드 {s.summary.gold} · 티켓 {s.summary.tickets}
                </small>
              </div>
              <button onClick={() => setAsk(s)}>불러오기</button>
              <button className="snap-del" aria-label="지우기" onClick={() => setList(api.dev!.deleteSnapshot(s.id))}>
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {ask && (
        <div className="modal-backdrop" onClick={() => setAsk(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">이 상태로 되돌릴까요?</div>
            <p>
              {fmt(ask.at)} 에 저장한 상태로 바꿔요
              <br />
              <span className="dim">지금 상태는 사라져요 (먼저 저장해 두세요)</span>
            </p>
            <div className="row pause-row">
              <button onClick={() => setAsk(null)}>취소</button>
              <button
                className="primary inline"
                onClick={() => {
                  api.dev!.loadSnapshot(ask.id)
                  location.reload()
                }}
              >
                불러오기
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** 개발자 코드 입력 창 (이스터에그로 열림) */
function DevCodeModal({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const [v, setV] = useState('')
  const [bad, setBad] = useState(false)
  const submit = () => {
    if (devCodeOk(v)) onOk()
    else {
      setBad(true)
      setV('')
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">코드</div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            className="dev-code"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={8}
            value={v}
            onChange={(e) => {
              setV(e.target.value)
              setBad(false)
            }}
          />
          {bad && <p className="dev-bad">맞지 않아요.</p>}
          <div className="row pause-row">
            <button type="button" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="primary inline">
              확인
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * 설정 탭 (2026-11-28): 소리(배경음·효과음 켜기/끄기 + 크기) · 도감 메뉴.
 * 도감은 메뉴를 누르면 들어가는 아래 화면 (← 설정 으로 돌아옴)
 */
function SettingsPage({ cfg, onSecret }: { cfg: DefenseConfig; onSecret: () => void }) {
  const [view, setView] = useState<'main' | 'codex' | 'guide'>('main')
  // "정보" 제목을 1.5초 간격 안으로 이어서 DEV_TAPS 번 누르면 개발자 코드 창 (이스터에그, 겉으론 아무 반응 없음)
  const taps = useRef<number[]>([])
  const tapInfo = () => {
    const n = Date.now()
    const prev = taps.current
    taps.current = prev.length && n - prev[prev.length - 1]! < 1500 ? [...prev, n] : [n]
    if (taps.current.length >= DEV_TAPS) {
      taps.current = []
      onSecret()
    }
  }
  if (view === 'guide')
    return (
      <>
        <div className="settings-sub-head">
          <BackButton label="설정" onClick={() => setView('main')} />
          <b>능력 설명</b>
        </div>
        <AbilityGuide cfg={cfg} />
      </>
    )
  if (view === 'codex')
    return (
      <>
        <div className="settings-sub-head">
          <BackButton label="설정" onClick={() => setView('main')} />
          <b>도감</b>
        </div>
        <Suspense fallback={<p className="dim">불러오는 중…</p>}>
          <Codex />
        </Suspense>
      </>
    )
  return (
    <>
      <SoundSettings />
      <ReplaySetting />
      <InstallSection />
      <section className="settings-menu">
        <h3 className="secret-tap" onClick={tapInfo}>
          정보
        </h3>
        <button onClick={() => setView('codex')}>
          <span>
            <Icon name="book" /> 도감
          </span>
          <small className="dim">병사 특수능력 · 슬라임 능력</small>
          <i>›</i>
        </button>
        <button onClick={() => setView('guide')}>
          <span>
            <Icon name="guide" /> 능력 설명
          </span>
          <small className="dim">능력치 계산 · 등급</small>
          <i>›</i>
        </button>
      </section>
    </>
  )
}

/** 앱 설치 (PWA, 2026-11-28): 이미 앱으로 열었으면 안 보임 */
function InstallSection() {
  const pwa = usePwa()
  if (pwa.standalone) return null
  return (
    <section className="install-section">
      <h3>앱으로 설치</h3>
      {pwa.canInstall ? (
        <>
          <p className="dim">홈 화면에 아이콘이 생기고, 주소창 없이 꽉 찬 화면으로 열려요</p>
          <button className="primary" onClick={() => void pwa.install()}>
            <Icon name="install" /> 홈 화면에 설치
          </button>
        </>
      ) : pwa.ios ? (
        <p className="dim">
          Safari 아래 <b>공유 버튼</b> → <b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요
        </p>
      ) : (
        <p className="dim">브라우저 메뉴(⋮)의 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>로 설치할 수 있어요</p>
      )}
    </section>
  )
}

/** 능력 설명 (2026-11-28): 캐릭 자세히에 있던 계산식 안내를 여기로 모음 */
function AbilityGuide({ cfg }: { cfg: DefenseConfig }) {
  const items = [
    { k: '공격력', r: `${cfg.atk.min} ~ ${cfg.atk.max}`, d: ['피해 = 공격력 − 슬라임 방어력 (최소 1)', '2배 데미지는 공격력 × 2 − 방어력'] },
    { k: '사거리', r: `${cfg.range.min} ~ ${cfg.range.max}칸`, d: [`이 칸 수 안의 슬라임을 공격 (${cfg.rangeShape === 'diamond' ? '마름모: 가로 + 세로 칸 수' : '네모: 대각선도 1칸'})`, '여러 마리면 도착에 가장 가까운 슬라임부터', '호크아이로 더 늘어날 수 있어요'] },
    { k: '공속', r: `${cfg.attackSpeed.min} ~ ${cfg.attackSpeed.max}`, d: ['1초에 공격하는 횟수'] },
    { k: '민첩', r: `${cfg.agility.min} ~ ${cfg.agility.max}`, d: ['명중 = 내 민첩 ÷ (내 민첩 + 슬라임 민첩)', '슬라임 기술(얼림·봉인 등)을 피할 때도 같은 계산', `특수능력 저항: 슬라임에게 거는 능력은 ${RESIST_POWER} ÷ (${RESIST_POWER} + 슬라임 민첩) 확률로 걸림`] },
  ]
  return (
    <>
      <section>
        <h3>능력치</h3>
        <ul className="guide-list">
          {items.map((it) => (
            <li key={it.k}>
              <b>{it.k}</b> <span className="dim">({it.r})</span>
              <ul>
                {it.d.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>등급</h3>
        <p className="dim" style={{ margin: '0 0 8px' }}>
          능력치 점수(0~100)로 정해져요. 특수능력으로 오른 값은 점수에 안 들어가요
        </p>
        <ul className="guide-tiers">
          {STAT_TIERS.map((t) => (
            <li key={t.tier}>
              <b className={`tl-dot t${t.tier}`} /> {t.name} <span className="dim">{t.min}점 ~</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

/** 화면 설정: 결정적 순간 다시 보기 켜기/끄기 (기본 켜짐) */
function ReplaySetting() {
  const [on, setOn] = useState(() => getSoundPrefs().replay)
  return (
    <section className="sound-settings">
      <h3>화면</h3>
      <div className="sound-row">
        <div className="sound-line">
          <span className="sound-name">명장면 다시 보기</span>
          <button
            role="switch"
            aria-checked={on}
            className={`switch ${on ? 'on' : ''}`}
            onClick={() => {
              setSoundPrefs({ replay: !on })
              setOn(!on)
            }}
          >
            <i />
            <span className="sr">{on ? '켜짐' : '꺼짐'}</span>
          </button>
        </div>
        <p className="dim setting-note">우두머리 처치 · 마지막 처치 · 마지막 통과를 확대해서 천천히 보여 줘요</p>
      </div>
    </section>
  )
}

/** 소리: 배경음·효과음 각각 켜기/끄기 + 크기 (이 기기에 저장) */
function SoundSettings({ compact }: { compact?: boolean } = {}) {
  const [p, setP] = useState<SoundPrefs>(getSoundPrefs)
  const set = (next: Partial<SoundPrefs>) => {
    setSoundPrefs(next)
    setP((cur) => ({ ...cur, ...next }))
  }
  const rows = [
    { on: 'bgm', vol: 'bgmVol', icon: 'music', name: '배경음' },
    { on: 'sfx', vol: 'sfxVol', icon: 'speaker', name: '효과음' },
  ] as const
  return (
    <section className={`sound-settings ${compact ? 'compact' : ''}`}>
      {!compact && <h3>소리</h3>}
      {rows.map((r) => (
        <div key={r.on} className={`sound-row ${p[r.on] ? '' : 'off'}`}>
          <div className="sound-line">
            <span className="sound-name">
              <Icon name={r.icon} /> {r.name}
            </span>
            {/* 켜기/끄기 스위치 */}
            <button
              role="switch"
              aria-checked={p[r.on]}
              className={`switch ${p[r.on] ? 'on' : ''}`}
              onClick={() => {
                unlockAudio()
                set({ [r.on]: !p[r.on] })
              }}
            >
              <i />
              <span className="sr">{p[r.on] ? '켜짐' : '꺼짐'}</span>
            </button>
          </div>
          <div className="sound-line">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={p[r.vol]}
              disabled={!p[r.on]}
              aria-label={`${r.name} 크기`}
              className="vol"
              // 채워진 부분 길이 (직접 그린 막대라 값만큼 색칠)
              style={{ '--pct': `${p[r.vol]}%` } as React.CSSProperties}
              onChange={(e) => {
                unlockAudio()
                set({ [r.vol]: Number(e.target.value) })
              }}
              // 효과음은 손을 뗄 때 한 번 들려줌 (얼마나 큰지 바로 알게)
              onPointerUp={() => r.on === 'sfx' && sfx.hit()}
            />
            <b className="sound-vol">{p[r.vol]}</b>
          </div>
        </div>
      ))}
    </section>
  )
}

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
            {spec.abilities.length > 0 && (
              <i className="chip-ab">
                {spec.abilities.map((a) => (
                  <MonAbIcon key={a} kind={a} size={14} />
                ))}
              </i>
            )}
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
        <span>특수능력 확률 100% (시험)</span>
        <input type="checkbox" checked={cfg.forceProc} onChange={(e) => onChange({ forceProc: e.target.checked })} />
      </label>
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
        능력치 범위를 바꾸면 병사가 다시 뽑힙니다 (같은 씨앗이라도 숫자가 달라짐).
      </p>
    </div>
  )
}
