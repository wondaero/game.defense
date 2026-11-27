/**
 * 맵 점검: npx vite-node scripts/check-maps.ts <maps.json>
 * maps.json = { "a": ["#######", ...], ... } (S 입구, E 출구, # 길, . 배치 칸)
 * 엔진의 parseMap 으로 읽어 보고, 길·배치 칸 수·꺾임·사거리 2로도 못 닿는 칸·명당을 출력
 */
import { readFileSync } from 'node:fs'
import { inRange, parseMap } from '../packages/defense/src/index.ts'

const file = process.argv[2]
if (!file) throw new Error('사용법: npx vite-node scripts/check-maps.ts <maps.json>')
const maps = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>

for (const [id, rows] of Object.entries(maps)) {
  try {
    const m = parseMap({ id, name: id, rows })
    const slots: { x: number; y: number }[] = []
    m.tiles.forEach((r, y) => r.forEach((t, x) => t === 'slot' && slots.push({ x, y })))
    const reach = (s: { x: number; y: number }, r: number) => m.path.filter((c) => inRange(s, c, r, 'diamond')).length
    const dead = slots.filter((s) => reach(s, 2) === 0)
    const best = Math.max(...slots.map((s) => reach(s, 2)))
    const best1 = Math.max(...slots.map((s) => reach(s, 1)))
    console.log(
      `${id}  길 ${String(m.path.length).padStart(2)} · 배치 ${String(slots.length).padStart(2)} · 꺾임 ${String(m.turns).padStart(2)} · 사거리1 최대 ${best1} · 사거리2 최대 ${best} · 못 닿는 칸 ${dead.length}${dead.length ? ' (' + dead.map((d) => `${d.x + 1}열${d.y + 1}행`).join(' ') + ')' : ''}`,
    )
  } catch (e) {
    console.log(`${id}  ❌ ${(e as Error).message}`)
  }
}
