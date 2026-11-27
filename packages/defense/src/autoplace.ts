import type { DefenseConfig } from './config.ts'
import { inRange, type Cell, type GameMap } from './map.ts'
import { baseStats, type UnitInstance } from './roster.ts'
import type { Placements } from './sim.ts'

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
