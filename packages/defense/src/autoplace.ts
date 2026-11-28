import type { DefenseConfig } from './config.ts'
import { inRange, type Cell, type GameMap } from './map.ts'
import { baseStats, statScore, type UnitInstance } from './roster.ts'
import type { Placements } from './sim.ts'

/**
 * 공격 칸 수 (2026-11-28): 이 자리에 선 캐릭의 사거리 안에 들어오는 길 칸 수.
 * 사거리는 특수능력(호크아이 등)까지 더한 값 · 설정의 사거리 모양(마름모/네모)을 따름
 */
export function attackCellCount(cfg: DefenseConfig, map: GameMap, cell: Cell, unit: Pick<UnitInstance, 'atk' | 'range' | 'attackSpeed' | 'agility' | 'ability'>): number {
  const r = baseStats(cfg, unit).range
  return map.path.reduce((n, c) => n + (inRange(cell, c, r, cfg.rangeShape) ? 1 : 0), 0)
}

/**
 * 간단 자동 배치 (탄 체력 보정·시뮬용. 사람보다 서툼).
 * 공격력·공속이 높은 캐릭부터, 아직 덜 덮인 길 칸을 사거리에 많이 넣는 배치 칸에 세운다.
 * 정수 점수 + 고정 순서라 같은 입력이면 항상 같은 배치.
 */
export function autoPlace(cfg: DefenseConfig, map: GameMap, roster: readonly UnitInstance[]): Placements {
  const slots: Cell[] = []
  map.tiles.forEach((row, y) => row.forEach((t, x) => t === 'slot' && slots.push({ x, y })))
  // 이미 많이 덮인 길 칸은 점수를 덜 줌 → 화력이 길 전체에 고르게
  const cover = map.path.map(() => 0)
  const score = (s: Cell, r: number) => map.path.reduce((sum, c, i) => sum + (inRange(s, c, r, cfg.rangeShape) ? Math.floor(1200 / (1 + cover[i]!)) : 0), 0)
  const units = [...roster].sort((a, b) => b.atk * b.attackSpeed - a.atk * a.attackSpeed).slice(0, cfg.maxDeploy)
  const p: Placements = {}
  const used = new Set<string>()
  for (const u of units) {
    let best: Cell | null = null
    let bestScore = -1
    for (const s of slots) {
      if (used.has(`${s.x},${s.y}`)) continue
      const v = score(s, baseStats(cfg, u).range)
      if (v > bestScore) {
        best = s
        bestScore = v
      }
    }
    if (!best) break
    used.add(`${best.x},${best.y}`)
    p[u.id] = best
    map.path.forEach((c, i) => inRange(best, c, baseStats(cfg, u).range, cfg.rangeShape) && cover[i]!++)
  }
  return p
}

/** 길이 꺾이는 칸 (앞뒤 칸 방향이 다른 칸) */
export function pathCorners(map: GameMap): Cell[] {
  const out: Cell[] = []
  for (let i = 1; i < map.path.length - 1; i++) {
    const a = map.path[i - 1]!
    const b = map.path[i]!
    const c = map.path[i + 1]!
    if (b.x - a.x !== c.x - b.x || b.y - a.y !== c.y - b.y) out.push(b)
  }
  return out
}

/**
 * 스마트 배치 (2026-11-28, 배치 화면 "자동 배치" 버튼):
 * - 능력치 점수 높은 캐릭부터 (특수능력은 안 봄)
 * - 길 꺾이는 칸 바로 옆(대각선 포함) 배치 칸 = 코너 자리를 먼저 차지
 * - 코너가 다 차면 나머지 칸 중 공격 칸 수가 많은 곳
 * - 이미 놓은 캐릭·자리는 그대로 두고 빈 자리만 채움. 같은 입력이면 항상 같은 결과
 */
export function smartPlace(cfg: DefenseConfig, map: GameMap, roster: readonly UnitInstance[], existing: Placements = {}): Placements {
  const key = (c: Cell) => `${c.x},${c.y}`
  const slots: Cell[] = []
  map.tiles.forEach((row, y) => row.forEach((t, x) => t === 'slot' && slots.push({ x, y })))
  const corners = pathCorners(map)
  const isCorner = new Set(slots.filter((s) => corners.some((c) => Math.abs(c.x - s.x) <= 1 && Math.abs(c.y - s.y) <= 1)).map(key))
  const p: Placements = { ...existing }
  const used = new Set(Object.values(existing).map((c) => key(c!)))
  const left = cfg.maxDeploy - Object.keys(existing).length
  const units = roster
    .filter((u) => !existing[u.id])
    .map((u) => ({ u, score: statScore(cfg, { ...u, ability: null }) }))
    .sort((a, b) => b.score - a.score || (a.u.id < b.u.id ? -1 : 1))
    .slice(0, Math.max(0, left))
  for (const { u } of units) {
    const free = slots.filter((s) => !used.has(key(s)))
    if (!free.length) break
    const corner = free.filter((s) => isCorner.has(key(s)))
    const pool = corner.length ? corner : free
    let best: Cell | null = null
    let bestN = -1
    for (const s of pool) {
      const n = attackCellCount(cfg, map, s, { ...u, ability: null })
      if (n > bestN) {
        best = s
        bestN = n
      }
    }
    if (!best || bestN <= 0) break
    p[u.id] = best
    used.add(key(best))
  }
  return p
}
