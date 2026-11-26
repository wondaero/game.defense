import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ABILITY_NAMES,
  STAT_NAMES,
  createRngState,
  createWave,
  DEFAULT_CONFIG,
  LAST_NORMAL_STAGE,
  MAP_DEFS,
  MONSTER_ABILITIES,
  monsterAbilityDesc,
  parseMap,
  rollRoster,
  stageDef,
  stageSummary,
  stepWave,
  type Cell,
  type DefenseConfig,
  type MonsterSpec,
  type Placements,
  type UnitInstance,
  type WaveSim,
} from '@def/defense'
import { CELL_PX, draw, monsterScreenPos, newAnimState, PAD, type Fx } from './draw.ts'
import { loadSprites, motionDuration } from './sprites.ts'
import { Bench } from './Bench.tsx'
import { abilityText, imageOf } from './format.ts'

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
}
const SAVE_KEY = 'defense.save.v1'
function loadSave(): Save {
  const empty: Save = { best: 0, rosterSeed: '시험판-1', placementsByMap: {}, unlockAll: false }
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Save>) } : empty
  } catch {
    return empty
  }
}

const pct = (bp: number) => `${Math.round(bp / 100)}%`
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}초`

export function App() {
  const [cfg, setCfg] = useState<DefenseConfig>({ ...DEFAULT_CONFIG })
  const [save, setSave] = useState<Save>(loadSave)
  const [screen, setScreen] = useState<Screen>('select')
  const [stageNo, setStageNo] = useState(1)
  const [result, setResult] = useState<{ cleared: boolean; text: string } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
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
      const dpr = window.devicePixelRatio || 1
      const W = L.map.width * CELL_PX + PAD * 2
      const H = L.map.height * CELL_PX + PAD * 2
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr
        canvas.height = H * dpr
        canvas.style.width = `${W}px`
        canvas.style.height = `${H}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const s = L.screen === 'prepare' ? null : simRef.current
      const anim = animRef.current
      // 애니메이션 시계: 진행 중엔 게임 시간(일시정지·배속 따라감), 준비 화면은 실제 시간
      anim.clock = s ? (s.tick - 1 + (s.done ? 1 : Math.min(1, accRef.current / tickMs))) * tickMs : now
      anim.corpses = anim.corpses.filter((c) => anim.clock - c.at < motionDuration(`mon_${c.type}`, 'die') + 100)
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
      if (ev.type === 'thorn') {
        fxRef.current.push({ kind: 'text', born: now, life: 600, to: monsterScreenPos(map, ev.dist, ev.monsterId), text: `${ev.amount}`, color: '#ef9a9a' })
        continue
      }
      if (ev.type === 'kill') {
        const p = monsterScreenPos(map, ev.dist, ev.monsterId)
        const spec = sim.stage.monsters[ev.monsterType]
        anim.corpses.push({ type: ev.monsterType, size: spec?.size ?? 0.22, x: p.x, y: p.y, flip: anim.monsterFlip.get(ev.monsterId) ?? false, at })
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
        if (ev.type === 'miss') {
          fxRef.current.push({ kind: 'shot', born: now, life: 150, from, to, color: 'rgba(255,255,255,0.35)' })
          fxRef.current.push({ kind: 'text', born: now, life: 600, to, text: '빗나감', color: '#b0bec5' })
          continue
        }
        if (!ev.splash) fxRef.current.push({ kind: 'shot', born: now, life: 150, from, to, color: imageOf(u.inst.image).color })
        fxRef.current.push({ kind: 'text', born: now, life: ev.crit ? 900 : 600, to, text: ev.crit ? `${ev.amount}!!` : `${ev.amount}`, color: ev.crit ? '#ff5252' : ev.splash ? '#ffb74d' : '#fff' })
      } else if (ev.type === 'leak') {
        const e = map.path.at(-1)!
        fxRef.current.push({ kind: 'leak', born: now, life: 500, to: { x: (e.x + 0.5) * CELL_PX, y: (e.y + 0.5) * CELL_PX } })
      } else if (ev.type === 'armorUp') {
        fxRef.current.push({ kind: 'text', born: now, life: 800, to: monsterScreenPos(map, ev.dist, ev.monsterId), text: '단단해짐!', color: '#cfd8dc' })
      } else if (ev.type === 'freeze') {
        const to = monsterScreenPos(map, ev.dist, ev.monsterId)
        fxRef.current.push({ kind: 'skill', born: now, life: 600, to, color: '#81d4fa' })
        for (const id of ev.unitIds) {
          const p = unitPos(id)
          if (p) fxRef.current.push({ kind: 'shot', born: now, life: 300, from: to, to: p, color: '#81d4fa' })
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
    const text = cleared
      ? `${n}탄 클리어! 남은 목숨 ${sim.lives} · ${sim.killed}마리 처치 · ${sim.leaked}마리 놓침 · ${(sim.tick / live.current.cfg.tickRate).toFixed(0)}초`
      : `${n}탄 실패 · ${sim.killed}마리 처치 · ${sim.leaked}마리 놓침`
    if (cleared) setSave((s) => ({ ...s, best: Math.max(s.best, n) }))
    setResult({ cleared, text })
    live.current.screen = 'result'
    setScreen('result')
  }

  const openStage = (n: number) => {
    setStageNo(n)
    simRef.current = null
    fxRef.current = []
    setSelectedId(null)
    setResult(null)
    setScreen('prepare')
  }

  const startStage = () => {
    simRef.current = createWave(cfg, map, stage, roster, placements, cfg.startLives)
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
    const occupant = roster.find((u) => {
      const p = placements[u.id]
      return p && p.x === c.x && p.y === c.y
    })
    if (screen !== 'prepare') {
      setSelectedId(occupant?.id ?? null)
      return
    }
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
    const r = e.currentTarget.getBoundingClientRect()
    return { x: Math.floor((e.clientX - r.left - PAD) / CELL_PX), y: Math.floor((e.clientY - r.top - PAD) / CELL_PX) }
  }

  const sim = simRef.current
  const maxOpen = save.unlockAll ? Infinity : save.best + 1

  if (screen === 'bench') return <Bench onBack={() => setScreen('select')} />

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
          <div className="stage-grid">
            {Array.from({ length: LAST_NORMAL_STAGE }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={`stage ${n <= save.best ? 'cleared' : ''} ${n % 10 === 0 ? 'boss' : ''}`}
                disabled={n > maxOpen}
                onClick={() => openStage(n)}
                title={n % 10 === 0 ? '우두머리 탄' : undefined}
              >
                {n}
              </button>
            ))}
          </div>
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
            <button onClick={() => setScreen('bench')}>🧪 그리기 성능 시험 (200개~)</button>
            <a className="dim" href="sprites/preview.html" target="_blank">스프라이트 모아 보기</a>
          </div>
        </section>
        <section>
          <h3>내 캐릭 ({roster.length}명)</h3>
          <ul className="roster">
            {roster.map((u) => (
              <UnitRow key={u.id} u={u} />
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
          <button className="link back" disabled={screen === 'play'} onClick={() => setScreen('select')}>
            ←
          </button>{' '}
          {stageNo}탄 {stage.isBoss && <span className="boss-tag">우두머리</span>}
          {stageNo > LAST_NORMAL_STAGE && <span className="inf-tag">무한</span>}
        </h1>
        <div className="stats">
          <span>❤️ 목숨 {sim && screen !== 'prepare' ? Math.max(0, sim.lives) : cfg.startLives}</span>
          {sim && screen !== 'prepare' && (
            <span>
              ⏱ {(sim.tick / cfg.tickRate).toFixed(1)}초 · 남은 몬스터 {sim.spawns.length - sim.spawnIdx + sim.monsters.length}
            </span>
          )}
          {sim && screen === 'play' && sim.levelBuffs.length > 0 && (
            <span className="lvl">⬆ 레벨업 {sim.levelBuffs.map((b) => `${STAT_NAMES[b.stat]} +${b.level}`).join(', ')}</span>
          )}
          <span>🏆 {save.best}탄</span>
        </div>
      </header>

      <main>
        <div className="board">
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
          {screen === 'result' && result && (
            <div className={`result ${result.cleared ? 'win' : 'lose'}`}>
              <div>{result.cleared ? '🎉 ' : '💀 '}{result.text}</div>
              <div className="row">
                {result.cleared && <button className="primary inline" onClick={() => openStage(stageNo + 1)}>다음 탄 ({stageNo + 1}) →</button>}
                <button onClick={() => openStage(stageNo)}>{result.cleared ? '다시 하기' : '배치 바꿔서 다시'}</button>
                <button onClick={() => setScreen('select')}>탄 고르기</button>
              </div>
            </div>
          )}

          <section>
            <h3>
              출연 몬스터 <span className="dim">· 맵 {map.name} · 길 {map.path.length}칸</span>
            </h3>
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
          체력 {hp} · 방어 {spec.armor} · 민첩 {spec.agility} · 속도 {speed.toFixed(1)}칸/초 · 놓치면 목숨 −{spec.leak}
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

function UnitRow(props: {
  u: UnitInstance
  selected?: boolean
  placed?: boolean
  onClick?: () => void
  children?: React.ReactNode
}) {
  const { u } = props
  const img = imageOf(u.image)
  const ab = abilityText(u)
  return (
    <li className={`${props.selected ? 'sel' : ''} ${props.placed ? 'placed' : ''}`} onClick={props.onClick}>
      <span className="face" style={{ background: img.color }}>
        {img.emoji}
      </span>
      <div className="info">
        <div>
          <b>{img.name}</b> 공격 {u.atk} · 사거리 {u.range} · 공속 {sec(u.interval)} · 민첩 {u.agility}
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
      {num('공격 간격 최소 (밀리초)', cfg.attackInterval.min, (v) => ({ attackInterval: { min: Math.max(50, v), max: Math.max(v, cfg.attackInterval.max) } }), 100, 50)}
      {num('공격 간격 최대 (밀리초)', cfg.attackInterval.max, (v) => ({ attackInterval: { min: Math.min(v, cfg.attackInterval.min), max: Math.max(50, v) } }), 100, 50)}
      {num('민첩 최소', cfg.agility.min, (v) => ({ agility: { min: v, max: Math.max(v, cfg.agility.max) } }), 1, 1)}
      {num('민첩 최대', cfg.agility.max, (v) => ({ agility: { min: Math.min(v, cfg.agility.min), max: v } }), 1, 1)}
      {num('몬스터 속도 (%)', cfg.monsterSpeedBp / 100, (v) => ({ monsterSpeedBp: Math.max(10, v) * 100 }), 10, 10)}
      {num('몬스터 체력 (%)', cfg.monsterHpBp / 100, (v) => ({ monsterHpBp: Math.max(10, v) * 100 }), 10, 10)}
      {num('시작 목숨', cfg.startLives, (v) => ({ startLives: Math.max(1, v) }), 1, 1)}
      {num('특수능력 확률 (%)', cfg.abilityChanceBp / 100, (v) => ({ abilityChanceBp: Math.min(100, v) * 100 }), 10)}
      <button onClick={() => onChange({ ...DEFAULT_CONFIG })}>기본값으로</button>
      <p className="dim" style={{ gridColumn: '1 / -1', margin: 0 }}>
        능력치 범위를 바꾸면 캐릭이 다시 뽑힙니다 (같은 씨앗이라도 숫자가 달라짐).
      </p>
    </div>
  )
}
