import { useEffect, useRef, useState } from 'react'
import { drawSprite, loadSprites, motionDuration } from './sprites.ts'

/**
 * 성능 시험: 몬스터 N마리 + 캐릭 N명이 각자 다른 모션으로 움직일 때 초당 프레임 수.
 * 몬스터는 타원 길을 돌며 가끔 맞음·스턴·죽음(→ 다시 나옴), 캐릭은 대기·공격·얼음을 오감.
 */
const MON_TYPES = ['normal', 'hp', 'armor', 'agi', 'spd', 'hp_armor', 'hp_agi', 'hp_spd', 'armor_agi', 'armor_spd', 'agi_spd', 'boss']
const UNIT_IDS = ['unit_t1', 'unit_t2', 'unit_t3', 'unit_t4', 'unit_t5', 'unit_t6']
const TOOL_IDS = [null, null, 'tool_stun', 'tool_splash', 'tool_crit', 'tool_obstacle', 'tool_recall', 'tool_teamLevel', 'tool_allAttack', 'tool_poison']
const W = 960
const H = 620

interface BMon {
  type: string
  pos: number
  speed: number
  lane: number
  motion: 'walk' | 'hit' | 'stun' | 'die'
  since: number
  next: number
}
interface BUnit {
  id: string
  tool: string | null
  x: number
  y: number
  motion: 'idle' | 'attack' | 'frozen'
  since: number
  next: number
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export function Bench({ onBack }: { onBack: () => void }) {
  const [count, setCount] = useState(100)
  const [fps, setFps] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let raf = 0
    let alive = true
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    const t0 = performance.now()
    const mons: BMon[] = Array.from({ length: count }, (_, i) => ({
      type: MON_TYPES[i % MON_TYPES.length]!,
      pos: Math.random(),
      speed: rnd(0.02, 0.06),
      lane: rnd(-1, 1),
      motion: 'walk',
      since: t0 - rnd(0, 2000),
      next: t0 + rnd(500, 4000),
    }))
    const cols = Math.ceil(Math.sqrt(count))
    const units: BUnit[] = Array.from({ length: count }, (_, i) => ({
      id: UNIT_IDS[i % UNIT_IDS.length]!,
      tool: TOOL_IDS[i % TOOL_IDS.length] ?? null,
      x: 330 + (i % cols) * (300 / cols),
      y: 175 + Math.floor(i / cols) * (300 / cols) + 300 / cols,
      motion: 'idle',
      since: t0 - rnd(0, 2000),
      next: t0 + rnd(200, 3000),
    }))
    let frames = 0
    let lastFps = t0
    let last = t0
    void loadSprites().then(() => {
      const loop = (now: number) => {
        if (!alive) return
        const dt = (now - last) / 1000
        last = now
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = '#3d5a40'
        ctx.fillRect(0, 0, W, H)
        ctx.strokeStyle = '#c8a97e'
        ctx.lineWidth = 46
        ctx.beginPath()
        ctx.ellipse(W / 2, H / 2, 420, 250, 0, 0, Math.PI * 2)
        ctx.stroke()

        // 캐릭: 가운데 격자
        const us = Math.min(60, 320 / cols)
        for (const u of units) {
          if (now >= u.next) {
            const r = Math.random()
            u.motion = r < 0.6 ? 'attack' : r < 0.7 ? 'frozen' : 'idle'
            u.since = now
            u.next = now + (u.motion === 'attack' ? motionDuration(u.id, 'attack') : u.motion === 'frozen' ? 1500 : rnd(300, 1500))
          }
          drawSprite(ctx, u.id, u.motion, now - u.since, u.x, u.y, us)
          if (u.tool) drawSprite(ctx, u.tool, u.motion, now - u.since, u.x, u.y, us)
        }

        // 몬스터: 타원 길
        for (const m of mons) {
          if (now >= m.next) {
            if (m.motion === 'die') {
              m.pos = Math.random()
              m.motion = 'walk'
              m.next = now + rnd(1000, 5000)
            } else {
              const r = Math.random()
              m.motion = r < 0.6 ? 'hit' : r < 0.8 ? 'stun' : 'die'
              m.next = now + (m.motion === 'stun' ? 1200 : motionDuration(`mon_${m.type}`, m.motion) + (m.motion === 'die' ? 300 : 0))
            }
            m.since = now
          }
          if (m.motion === 'walk' || m.motion === 'hit') m.pos = (m.pos + m.speed * dt) % 1
          const a = m.pos * Math.PI * 2
          const x = W / 2 + Math.cos(a) * (420 + m.lane * 14)
          const y = H / 2 + Math.sin(a) * (250 + m.lane * 14)
          const flip = -Math.sin(a) < 0
          const size = m.type === 'boss' ? 62 : m.type.startsWith('hp') ? 52 : m.type.includes('spd') ? 40 : 46
          drawSprite(ctx, `mon_${m.type}`, m.motion, m.motion === 'walk' ? now - m.since + m.pos * 9999 : now - m.since, x, y + size * 0.42, size, flip)
        }

        frames++
        if (now - lastFps >= 1000) {
          setFps(Math.round((frames * 1000) / (now - lastFps)))
          frames = 0
          lastFps = now
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    })
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [count])

  return (
    <div className="app">
      <header>
        <h1>
          <button className="link back" onClick={onBack}>
            ←
          </button>{' '}
          그리기 성능 시험
        </h1>
        <div className="stats">
          <span className="fps">
            초당 <b>{fps}</b> 프레임
          </span>
          <span>총 {count * 2}개 (슬라임 {count} + 캐릭 {count})</span>
        </div>
      </header>
      <div className="row" style={{ marginBottom: 8 }}>
        {[50, 100, 250, 500, 1000].map((n) => (
          <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
            {n * 2}개
          </button>
        ))}
        <span className="dim">60 근처면 부드러움. 개체마다 모션·프레임이 따로 돎</span>
      </div>
      <canvas ref={canvasRef} style={{ borderRadius: 8, maxWidth: "100%", height: "auto" }} />
    </div>
  )
}
