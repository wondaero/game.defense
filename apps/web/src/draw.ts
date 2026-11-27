import { inRange, MONSTER_ABILITIES, positionAt, type Cell, type DefenseConfig, type GameMap, type Placements, type UnitInstance, type WaveSim } from '@def/defense'
import { unitLook } from './format.ts'
import { drawSprite, motionDuration, spritesReady } from './sprites.ts'
import { groundImage, type GroundMode } from './ground.ts'

export const CELL_PX = 60
/** 판 둘레 여백 (가장자리 몬스터·입구 밖 몬스터가 잘리지 않게) */
export const PAD = 28
/** 캐릭 그림 크기 = 칸 × 이 값. 원래 크기 그대로 — 도구·모션이 칸 밖으로 넘쳐도 자르지 않음(넘침 허용, 2026-11-27) */
export const UNIT_SCALE = 0.98

/** 화면 효과 (시간은 performance.now 밀리초) */
export interface Fx {
  /** bolt = 날아가는 빛 구슬 · slash = 베기 반달 · burst = 맞은 자리 팡 (2026-11-27 평타 효과) */
  kind: 'shot' | 'text' | 'leak' | 'skill' | 'bolt' | 'slash' | 'burst'
  /** 크기 배율 (2배 데미지는 크게) */
  size?: number
  /** 베기 방향 (라디안) */
  angle?: number
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
  /** 이 시각(실제 시간)까지 화면 살짝 흔들림 (2배 데미지) */
  shakeUntil?: number
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
  // 2배 데미지: 판이 살짝 흔들림
  if (d.anim.shakeUntil && d.now < d.anim.shakeUntil) ctx.translate(Math.sin(d.now * 0.9) * 3, Math.cos(d.now * 1.3) * 2)

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
  // 칸보다 크게 그려도 되게(넘침 허용): 위쪽 칸부터 그려서 아래 칸 캐릭이 앞에 보이게
  const lvl = d.sim ? Math.max(0, ...d.sim.levelBuffs.filter((b) => d.sim!.tick < b.until).map((b) => b.level)) : 0
  const levelScale = 1 + lvl * 0.1
  const unitsInOrder = [...unitAt].sort(([a], [b]) => Number(a.split(',')[1]) - Number(b.split(',')[1]) || Number(a.split(',')[0]) - Number(b.split(',')[0]))
  for (const [k, u] of unitsInOrder) {
    const [x, y] = k.split(',').map(Number) as [number, number]
    const cx = (x + 0.5) * CELL_PX
    const cy = (y + 0.5) * CELL_PX
    const look = unitLook(cfg, u)
    const su = d.sim?.units.find((s) => s.inst.id === u.id)
    const frozen = !!(su && d.sim && d.sim.tick < su.frozenUntil)
    const weakened = !!(su && d.sim && d.sim.tick < su.weakenedUntil)
    const sealed = !!(su && d.sim && d.sim.tick < su.sealedUntil)
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
    // 아군 전체 레벨업 중엔 캐릭이 커짐: +1 = 1.1배 · +2 = 1.2배 · +3 = 1.3배 (여러 개면 가장 높은 것) — 글자 대신 (2026-11-27)
    const size = CELL_PX * UNIT_SCALE * levelScale
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
    if (sealed) {
      // 봉인: 사슬 자물쇠 (특수능력·닌자·장군 효과 꺼짐)
      ctx.font = '16px serif'
      ctx.fillText('🔒', cx + CELL_PX * 0.32, cy - CELL_PX * 0.32)
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
    } else if (f.kind === 'bolt' && f.from) {
      // 빛 구슬: 꼬리 4개 + 빛나는 머리
      ctx.globalAlpha = 1
      const sz = f.size ?? 1
      const at = (q: number) => ({ x: f.from!.x + (f.to.x - f.from!.x) * q, y: f.from!.y + (f.to.y - f.from!.y) * q })
      for (let t = 4; t >= 1; t--) {
        const q = Math.max(0, k - t * 0.09)
        const p = at(q)
        ctx.fillStyle = f.color ?? '#fff'
        ctx.globalAlpha = 0.18 * (5 - t)
        ctx.beginPath()
        ctx.arc(p.x, p.y, (5 - t) * 1.3 * sz, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      const p = at(k)
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8 * sz)
      g.addColorStop(0, '#ffffff')
      g.addColorStop(0.45, f.color ?? '#fff')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.x, p.y, 8 * sz, 0, Math.PI * 2)
      ctx.fill()
    } else if (f.kind === 'slash') {
      // 베기: 맞은 자리에서 반달이 휙 돌아감
      const sz = f.size ?? 1
      const a0 = (f.angle ?? 0) - 1.2 + k * 1.4
      ctx.lineCap = 'round'
      ctx.strokeStyle = f.color ?? '#fff'
      ctx.lineWidth = 6 * sz
      ctx.beginPath()
      ctx.arc(f.to.x, f.to.y, 15 * sz, a0, a0 + 2.1)
      ctx.stroke()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2 * sz
      ctx.beginPath()
      ctx.arc(f.to.x, f.to.y, 15 * sz, a0 + 0.3, a0 + 1.8)
      ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.lineWidth = 1
    } else if (f.kind === 'burst') {
      // 팡: 퍼지는 고리 + 튀는 불똥 6개
      const sz = f.size ?? 1
      ctx.strokeStyle = f.color ?? '#fff'
      ctx.lineWidth = 3 * (1 - k) + 1
      ctx.beginPath()
      ctx.arc(f.to.x, f.to.y, (5 + k * 16) * sz, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineCap = 'round'
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 + 0.4
        const r0 = (6 + k * 14) * sz
        const r1 = (10 + k * 20) * sz
        ctx.beginPath()
        ctx.moveTo(f.to.x + Math.cos(a) * r0, f.to.y + Math.sin(a) * r0)
        ctx.lineTo(f.to.x + Math.cos(a) * r1, f.to.y + Math.sin(a) * r1)
        ctx.stroke()
      }
      ctx.lineCap = 'butt'
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
