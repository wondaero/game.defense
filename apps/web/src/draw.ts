import { inRange, MONSTER_ABILITIES, positionAt, type Cell, type DefenseConfig, type GameMap, type Placements, type UnitInstance, type WaveSim } from '@def/defense'
import { unitLook } from './format.ts'
import { drawSprite, motionDuration, spritesReady } from './sprites.ts'
import { groundImage, type GroundMode } from './ground.ts'

export const CELL_PX = 60
/** 판 둘레 여백 (가장자리 몬스터·입구 밖 몬스터가 잘리지 않게) */
export const PAD = 28

/** 화면 효과 (시간은 performance.now 밀리초) */
export interface Fx {
  kind: 'shot' | 'text' | 'leak' | 'skill'
  born: number
  life: number
  from?: { x: number; y: number }
  to: { x: number; y: number }
  text?: string
  color?: string
}

export interface DrawInput {
  cfg: DefenseConfig
  map: GameMap
  roster: readonly UnitInstance[]
  placements: Placements
  sim: WaveSim | null
  /** 0~1: 직전 틱과 현재 틱 사이 (부드러운 이동) */
  alpha: number
  selectedId: string | null
  hover: Cell | null
  fx: Fx[]
  now: number
  anim: AnimState
}

/** 화면용 애니메이션 상태 (게임 계산과 무관). clock = 게임 시간(밀리초) → 일시정지·배속 따라감 */
export interface AnimState {
  clock: number
  unitAttackAt: Map<string, number>
  monsterHitAt: Map<number, number>
  /** 몬스터가 마지막으로 왼쪽을 보고 있었나 (위아래로 갈 땐 그대로) */
  monsterFlip: Map<number, boolean>
  corpses: { type: string; size: number; x: number; y: number; flip: boolean; at: number }[]
}

export const newAnimState = (): AnimState => ({ clock: 0, unitAttackAt: new Map(), monsterHitAt: new Map(), monsterFlip: new Map(), corpses: [] })

/** 몬스터 그림 크기 (px) */
export const monsterSize = (specSize: number) => CELL_PX * (specSize * 2 + 0.4)

/** 가는 방향이 왼쪽이면 뒤집기 */
export function monsterFacesLeft(map: GameMap, dist: number, id: number, memo: Map<number, boolean>): boolean {
  const a = positionAt(map, Math.max(0, dist - 40))
  const b = positionAt(map, dist)
  const dx = b.x - a.x
  if (Math.abs(dx) > 0.001) memo.set(id, dx < 0)
  return memo.get(id) ?? false
}

/** 몬스터마다 길 옆으로 살짝 흩어 그리기 (화면용, 계산엔 영향 없음) */
const jitter = (id: number) => ({ x: (((id * 37) % 9) - 4) * 0.035, y: (((id * 53) % 9) - 4) * 0.035 })

export function monsterScreenPos(map: GameMap, dist: number, id: number) {
  const p = positionAt(map, dist)
  const j = jitter(id)
  return { x: (p.x + j.x) * CELL_PX, y: (p.y + j.y) * CELL_PX }
}

export function draw(ctx: CanvasRenderingContext2D, d: DrawInput) {
  const { map, cfg } = d
  const W = map.width * CELL_PX
  const H = map.height * CELL_PX
  ctx.clearRect(0, 0, W + PAD * 2, H + PAD * 2)
  ctx.save()
  ctx.translate(PAD, PAD)

  // 진행 중엔 sim 의 실제 자리 (날려 보내기로 옮겨질 수 있음), 준비 중엔 배치
  const unitAt = new Map<string, UnitInstance>()
  if (d.sim) for (const su of d.sim.units) unitAt.set(`${su.cell.x},${su.cell.y}`, su.inst)
  else
    for (const u of d.roster) {
      const c = d.placements[u.id]
      if (c) unitAt.set(`${c.x},${c.y}`, u)
    }
  const selected = d.roster.find((u) => u.id === d.selectedId) ?? null
  // 사거리 미리 보기: 선택한 캐릭을 마우스 칸(배치 중) 또는 선 자리 기준으로
  const selectedCell = selected ? (d.sim?.units.find((s) => s.inst.id === selected.id)?.cell ?? d.placements[selected.id]) : null
  const rangeOrigin = selected ? (d.hover && map.tiles[d.hover.y]?.[d.hover.x] === 'slot' && !d.sim ? d.hover : selectedCell) : null

  // 바닥: 풀밭 + 부드러운 길 (배치 중에만 배치 칸 네모·길 방향 화살표). 맵마다 한 번 그려 둔 그림을 씀
  const mode: GroundMode = d.sim ? 'play' : 'prepare'
  ctx.drawImage(groundImage(map, mode, CELL_PX, Math.max(1, ctx.getTransform().a)), 0, 0, map.width * CELL_PX, map.height * CELL_PX)

  // 사거리 미리 보기: 닿는 칸을 노랗게 (길 칸은 진하게)
  if (rangeOrigin && selected) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!inRange(rangeOrigin, { x, y }, selected.range, cfg.rangeShape)) continue
        ctx.fillStyle = map.tiles[y]![x] === 'path' ? 'rgba(255,240,120,0.42)' : 'rgba(255,240,120,0.16)'
        ctx.beginPath()
        ctx.roundRect(x * CELL_PX + 2, y * CELL_PX + 2, CELL_PX - 4, CELL_PX - 4, 8)
        ctx.fill()
      }
    }
  }

  // 장애물: 가시(갈색 뾰족) · 늪(파란 웅덩이)
  for (const o of d.sim?.obstacles ?? []) {
    const c = map.path[o.index]!
    const cx = (c.x + 0.5) * CELL_PX
    const cy = (c.y + 0.5) * CELL_PX
    if (o.kind === 'damage') {
      ctx.fillStyle = '#6d4c41'
      ctx.strokeStyle = '#3e2723'
      ctx.lineWidth = 1.5
      for (const [dx, dy] of [[-11, 6], [0, -6], [11, 6], [-4, 10], [6, -1]] as const) {
        ctx.beginPath()
        ctx.moveTo(cx + dx - 6, cy + dy + 6)
        ctx.lineTo(cx + dx, cy + dy - 8)
        ctx.lineTo(cx + dx + 6, cy + dy + 6)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    } else {
      ctx.fillStyle = 'rgba(30,136,229,0.55)'
      ctx.strokeStyle = 'rgba(187,222,251,0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, CELL_PX * 0.36, CELL_PX * 0.24, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.lineWidth = 1
  }

  // 마우스 칸 (배치 중)
  if (d.hover && !d.sim && map.tiles[d.hover.y]?.[d.hover.x] === 'slot') {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.roundRect(d.hover.x * CELL_PX + 3, d.hover.y * CELL_PX + 3, CELL_PX - 6, CELL_PX - 6, 8)
    ctx.stroke()
    ctx.lineWidth = 1
  }

  // 캐릭 (스프라이트: 기본 idle, 공격하면 attack, 얼면 frozen)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const sprites = spritesReady()
  let idx = 0
  for (const [k, u] of unitAt) {
    const [x, y] = k.split(',').map(Number) as [number, number]
    const cx = (x + 0.5) * CELL_PX
    const cy = (y + 0.5) * CELL_PX
    const look = unitLook(cfg, u)
    const su = d.sim?.units.find((s) => s.inst.id === u.id)
    const frozen = !!(su && d.sim && d.sim.tick < su.frozenUntil)
    const weakened = !!(su && d.sim && d.sim.tick < su.weakenedUntil)
    if (u.id === d.selectedId) {
      ctx.fillStyle = 'rgba(255,245,157,0.35)'
      ctx.strokeStyle = '#fff59d'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(cx, cy + CELL_PX * 0.36, CELL_PX * 0.36, CELL_PX * 0.12, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.lineWidth = 1
    }
    const atkAt = d.anim.unitAttackAt.get(u.id)
    const atkT = atkAt === undefined ? Infinity : d.anim.clock - atkAt
    const motion = frozen ? 'frozen' : atkT < motionDuration(look.body, 'attack') ? 'attack' : 'idle'
    const t = motion === 'attack' ? atkT : d.anim.clock + idx * 377
    idx++
    // 몸(헬멧 색 = 능력치 등급) + 손 도구(특수능력). 얼었을 땐 도구를 얼음 뒤에
    const foot = cy + CELL_PX * 0.42
    const size = CELL_PX * 0.98
    if (frozen && look.tool && sprites) drawSprite(ctx, look.tool, motion, t, cx, foot, size)
    const drawn = sprites && drawSprite(ctx, look.body, motion, t, cx, foot, size)
    if (!frozen && look.tool && drawn) drawSprite(ctx, look.tool, motion, t, cx, foot, size)
    if (!drawn) {
      ctx.fillStyle = look.color
      ctx.beginPath()
      ctx.arc(cx, cy, CELL_PX * 0.4, 0, Math.PI * 2)
      ctx.fill()
      if (frozen) {
        ctx.fillStyle = 'rgba(129,212,250,0.6)'
        ctx.fillRect(x * CELL_PX + 3, y * CELL_PX + 3, CELL_PX - 6, CELL_PX - 6)
      }
    }
    if (weakened) {
      // 약화: 보라 아래 화살표
      ctx.font = 'bold 14px sans-serif'
      ctx.fillStyle = '#b388ff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.strokeText('↓', cx - CELL_PX * 0.36, cy - CELL_PX * 0.34)
      ctx.fillText('↓', cx - CELL_PX * 0.36, cy - CELL_PX * 0.34)
      ctx.lineWidth = 1
    }
  }

  // 죽는 몬스터 (die 모션 한 번)
  for (const c of d.anim.corpses) {
    const size = monsterSize(c.size)
    drawSprite(ctx, `mon_${c.type}`, 'die', d.anim.clock - c.at, c.x, c.y + size * 0.42, size, c.flip)
  }

  // 몬스터 (직전 틱 ~ 현재 틱 사이를 보간). 뒤에 있는 것부터
  if (d.sim) {
    const ms = [...d.sim.monsters].sort((a, b) => a.dist - b.dist)
    for (const m of ms) {
      const dist = m.prevDist + (m.dist - m.prevDist) * d.alpha
      const p = monsterScreenPos(map, dist, m.id)
      const t = m.spec
      const size = monsterSize(t.size)
      const flip = monsterFacesLeft(map, dist, m.id, d.anim.monsterFlip)
      const stunned = d.sim.tick < m.stunnedUntil
      const hitAt = d.anim.monsterHitAt.get(m.id)
      const hitT = hitAt === undefined ? Infinity : d.anim.clock - hitAt
      const motion = stunned ? 'stun' : hitT < motionDuration(`mon_${m.type}`, 'hit') ? 'hit' : 'walk'
      const mt = motion === 'hit' ? hitT : d.anim.clock + m.id * 137
      const foot = p.y + size * 0.42
      if (d.sim.tick < m.invincibleUntil) {
        // 무적: 금색 원
        ctx.strokeStyle = '#ffd54f'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(p.x, foot - size * 0.42, size * 0.5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.lineWidth = 1
      }
      if (d.sim.tick < m.hasteUntil) {
        // 질주: 뒤쪽 주황 줄
        ctx.strokeStyle = '#ffab40'
        ctx.lineWidth = 2
        const back = flip ? 1 : -1
        for (const dy of [-0.2, 0, 0.2]) {
          ctx.beginPath()
          ctx.moveTo(p.x + back * size * 0.35, foot - size * (0.42 + dy))
          ctx.lineTo(p.x + back * size * 0.6, foot - size * (0.42 + dy))
          ctx.stroke()
        }
        ctx.lineWidth = 1
      }
      if (d.sim.tick < m.armorUpUntil) {
        // 단단해지기: 발밑 회색 방패 고리
        ctx.strokeStyle = '#eceff1'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.ellipse(p.x, foot - 2, size * 0.42, size * 0.14, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.lineWidth = 1
      }
      const drawn = sprites && drawSprite(ctx, `mon_${m.type}`, motion, mt, p.x, foot, size, flip)
      if (m.poisonDmg > 0) {
        // 맹독: 발밑 보라 고리 + 위로 올라가는 보라 방울
        ctx.strokeStyle = 'rgba(142,36,170,0.9)'
        ctx.fillStyle = 'rgba(186,104,200,0.25)'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.ellipse(p.x, foot - 2, size * 0.4, size * 0.13, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.lineWidth = 1
        const ph = (d.anim.clock / 600 + m.id * 0.37) % 1
        ctx.fillStyle = 'rgba(186,104,200,0.85)'
        for (let k = 0; k < 3; k++) {
          const q = (ph + k / 3) % 1
          ctx.beginPath()
          ctx.arc(p.x + (k - 1) * size * 0.18, foot - size * (0.55 + q * 0.45), 2 + (1 - q) * 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      if (!drawn) {
        ctx.fillStyle = t.color
        ctx.strokeStyle = '#000'
        ctx.beginPath()
        ctx.arc(p.x, p.y, t.size * CELL_PX, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      // 체력 막대 + 몬스터 능력 표시
      const top = foot - size * 0.82
      const bw = Math.max(18, size * 0.6)
      ctx.fillStyle = '#000'
      ctx.fillRect(p.x - bw / 2, top, bw, 4)
      ctx.fillStyle = m.hp / m.maxHp > 0.5 ? '#66bb6a' : m.hp / m.maxHp > 0.25 ? '#ffca28' : '#ef5350'
      ctx.fillRect(p.x - bw / 2, top, (bw * Math.max(0, m.hp)) / m.maxHp, 4)
      if (t.abilities.length) {
        ctx.font = 'bold 9px sans-serif'
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'left'
        ctx.fillText(t.abilities.map((a) => MONSTER_ABILITIES[a].icon).join(''), p.x + bw / 2 + 3, top + 2)
        ctx.textAlign = 'center'
      }
    }
  }

  // 효과
  for (const f of d.fx) {
    const k = (d.now - f.born) / f.life
    if (k < 0 || k > 1) continue
    ctx.globalAlpha = 1 - k
    if (f.kind === 'shot' && f.from) {
      ctx.strokeStyle = f.color ?? '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(f.from.x, f.from.y)
      ctx.lineTo(f.to.x, f.to.y)
      ctx.stroke()
      ctx.lineWidth = 1
    } else if (f.kind === 'text') {
      ctx.fillStyle = f.color ?? '#fff'
      ctx.font = 'bold 13px sans-serif'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.strokeText(f.text ?? '', f.to.x, f.to.y - 16 - k * 18)
      ctx.fillText(f.text ?? '', f.to.x, f.to.y - 16 - k * 18)
      ctx.lineWidth = 1
    } else if (f.kind === 'leak' || f.kind === 'skill') {
      ctx.strokeStyle = f.color ?? '#f44336'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(f.to.x, f.to.y, 10 + k * 40, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 1
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()
}
