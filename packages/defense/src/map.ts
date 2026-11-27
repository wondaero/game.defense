/**
 * 맵: 칸마다 길(#·S·E) 또는 배치 칸(.) 또는 막힌 칸(x).
 * 몬스터 위치 = 길 위에서 간 거리(정수). 칸은 배치 자리와 사거리 계산에만 쓴다.
 *
 * 거리 단위: 칸 하나 = CELL. i번째 길 칸의 범위는 [i*CELL, (i+1)*CELL), 중심은 i*CELL + CELL/2.
 * 거리 0 = 판 가장자리(입구). **출구(E) 칸 가운데에 닿으면 끝** (거리 path.length*CELL − CELL/2) →
 * 몬스터는 E 칸에서 사라진다. E 가 어느 쪽을 보든 판 밖이나 옆 칸으로 걸어 나가지 않음 (2026-11-27).
 */
export const CELL = 1000

export interface Cell {
  x: number
  y: number
}

export type Tile = 'path' | 'slot' | 'block'

export interface MapDef {
  id: string
  name: string
  /** 위에서부터 한 줄씩. S = 입구 길, E = 출구 길, # = 길, . = 배치 칸, x = 막힘 */
  rows: readonly string[]
}

export interface GameMap {
  id: string
  name: string
  width: number
  height: number
  tiles: Tile[][] // [y][x]
  /** 입구 → 출구 순서의 길 칸 */
  path: Cell[]
  /** 길 전체 길이 (거리 단위) = 입구 가장자리 ~ 출구 칸 가운데. 여기 닿으면 몬스터가 사라짐 */
  length: number
  /** 꺾이는 곳 수 (참고용) */
  turns: number
}

const key = (c: Cell) => `${c.x},${c.y}`

export function parseMap(def: MapDef): GameMap {
  const height = def.rows.length
  const width = def.rows[0]?.length ?? 0
  if (!width) throw new Error(`맵 ${def.id}: 비어 있음`)
  let start: Cell | null = null
  let end: Cell | null = null
  const tiles: Tile[][] = def.rows.map((row, y) => {
    if (row.length !== width) throw new Error(`맵 ${def.id}: ${y + 1}행 길이가 다름`)
    return [...row].map((ch, x): Tile => {
      if (ch === 'S') start = { x, y }
      if (ch === 'E') end = { x, y }
      if (ch === 'S' || ch === 'E' || ch === '#') return 'path'
      if (ch === '.') return 'slot'
      if (ch === 'x') return 'block'
      throw new Error(`맵 ${def.id}: 모르는 글자 '${ch}'`)
    })
  })
  if (!start || !end) throw new Error(`맵 ${def.id}: S(입구)·E(출구)가 필요함`)

  const isPath = (x: number, y: number) => tiles[y]?.[x] === 'path'
  const path: Cell[] = [start]
  const seen = new Set([key(start)])
  let cur: Cell = start
  while (key(cur) !== key(end)) {
    const next = [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ].filter((c) => isPath(c.x, c.y) && !seen.has(key(c)))
    if (next.length !== 1) throw new Error(`맵 ${def.id}: (${cur.x + 1},${cur.y + 1}) 에서 길이 ${next.length}갈래 (한 줄 길이어야 함)`)
    cur = next[0]!
    seen.add(key(cur))
    path.push(cur)
  }
  const total = tiles.flat().filter((t) => t === 'path').length
  if (total !== path.length) throw new Error(`맵 ${def.id}: 이어지지 않은 길 칸이 있음`)

  let turns = 0
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const c = path[i + 1]!
    if (b.x - a.x !== c.x - b.x || b.y - a.y !== c.y - b.y) turns++
  }
  return { id: def.id, name: def.name, width, height, tiles, path, length: path.length * CELL - CELL / 2, turns }
}

/** 첫 칸에서 들어오는 방향 / 마지막 칸에서 나가는 방향 = 판 밖으로 이어지는 쪽 */
function stepDir(map: GameMap, i: number): Cell {
  const p = map.path
  if (p.length === 1) return { x: 1, y: 0 }
  if (i <= 0) return { x: p[1]!.x - p[0]!.x, y: p[1]!.y - p[0]!.y }
  if (i >= p.length) {
    const n = p.length
    return { x: p[n - 1]!.x - p[n - 2]!.x, y: p[n - 1]!.y - p[n - 2]!.y }
  }
  return { x: p[i]!.x - p[i - 1]!.x, y: p[i]!.y - p[i - 1]!.y }
}

/** 거리 → 몬스터가 있는 칸 번호 (path 인덱스) */
export const pathIndexAt = (map: GameMap, dist: number) => Math.min(map.path.length - 1, Math.max(0, Math.floor(dist / CELL)))

/** 거리 → 판 좌표 (칸 단위 실수, 칸 중심 = x+0.5). 화면 그리기용 */
export function positionAt(map: GameMap, dist: number): { x: number; y: number } {
  const i = pathIndexAt(map, dist)
  const c = map.path[i]!
  const f = (dist - i * CELL) / CELL // 0~1 (입구·출구 밖은 범위를 벗어날 수 있음)
  const half = 0.5
  if (f < half) {
    const d = stepDir(map, i) // 들어온 방향
    return { x: c.x + half - d.x * (half - f), y: c.y + half - d.y * (half - f) }
  }
  const d = stepDir(map, i + 1) // 나가는 방향
  return { x: c.x + half + d.x * (f - half), y: c.y + half + d.y * (f - half) }
}

/** 두 칸 사이가 사거리 안인지 */
export function inRange(a: Cell, b: Cell, range: number, shape: 'diamond' | 'square'): boolean {
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  return shape === 'diamond' ? dx + dy <= range : Math.max(dx, dy) <= range
}
