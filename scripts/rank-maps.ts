/**
 * 맵 난이도 순서 → packages/defense/src/mapOrder.ts
 * 실행: npm run rank-maps  (맵을 바꾸면: npm run maps → npm run rank-maps → npm run calibrate)
 *
 * 맵마다 같은 탄 구성(15·35·55탄)을 기준 덱으로 돌려 "목숨 절반 남기고 깨는 최대 체력"을 찾음.
 * 버티는 체력이 클수록 쉬운 맵. 세 탄의 체력을 곱해 비교(기하 평균) → 쉬운 맵부터 차례로 탄에 배치.
 * 칸 수(길·배치)만으로는 "길은 긴데 배치 칸이 안 닿음" 같은 걸 못 잡아서 실제로 돌려 봄.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  autoPlace,
  createWave,
  DEFAULT_CONFIG,
  inRange,
  MAP_DEFS,
  parseMap,
  referenceDeck,
  referencePasses,
  runWave,
  stageDefWithHp,
  type GameMap,
} from '../packages/defense/src/index.ts'

const cfg = { ...DEFAULT_CONFIG }
const SAMPLE_STAGES = [15, 35, 55]

function passes(map: GameMap, n: number, hpBp: number): boolean {
  const st = { ...stageDefWithHp(n, hpBp), mapId: map.id }
  const deck = referenceDeck(n)
  const r = runWave(createWave(cfg, map, st, deck, autoPlace(cfg, map, deck), cfg.startLives))
  return referencePasses(r)
}

function maxHp(map: GameMap, n: number): number {
  if (!passes(map, n, 1)) return 1
  let lo = 1
  let hi = 10_000
  while (passes(map, n, hi)) {
    lo = hi
    hi *= 2
  }
  while (hi - lo > Math.max(1, Math.floor(lo / 100))) {
    const mid = Math.floor((lo + hi) / 2)
    if (passes(map, n, mid)) lo = mid
    else hi = mid
  }
  return lo
}

const t0 = Date.now()
const rows = MAP_DEFS.map((d) => {
  const map = parseMap(d)
  const hps = SAMPLE_STAGES.map((n) => maxHp(map, n))
  const score = Math.exp(hps.reduce((s, h) => s + Math.log(h), 0) / hps.length) // 기하 평균
  const slots: { x: number; y: number }[] = []
  map.tiles.forEach((r, y) => r.forEach((t, x) => t === 'slot' && slots.push({ x, y })))
  const reachable = slots.filter((s) => map.path.some((c) => inRange(s, c, 2, 'diamond'))).length
  return { id: d.id, score, hps, path: map.path.length, slots: slots.length, reachable, turns: map.turns }
})
rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
const top = rows[0]!.score
for (const [i, r] of rows.entries()) {
  console.log(
    `${String(i + 1).padStart(2)}. ${r.id}  쉬움 ${((r.score / top) * 100).toFixed(0).padStart(3)}%  (길 ${r.path} · 배치 ${r.slots} · 닿는 배치 ${r.reachable} · 꺾임 ${r.turns})`,
  )
}

const out = fileURLToPath(new URL('../packages/defense/src/mapOrder.ts', import.meta.url))
writeFileSync(
  out,
  `// npm run rank-maps 가 만든 파일 (직접 고치지 말 것). ${new Date().toISOString().slice(0, 10)}
// 쉬운 맵 → 어려운 맵. 탄은 이 순서로 맵 하나당 STAGES_PER_MAP 탄씩 (stages.ts)
// 쉬움 % = 기준 덱이 버티는 몬스터 체력 (가장 쉬운 맵 = 100%)
export const MAP_ORDER: readonly string[] = [
${rows.map((r) => `  '${r.id}', // 쉬움 ${((r.score / top) * 100).toFixed(0)}% · 길 ${r.path} · 배치 ${r.slots} · 꺾임 ${r.turns}`).join('\n')}
]
`,
)
console.log(`\n${out} 저장 (${((Date.now() - t0) / 1000).toFixed(1)}초)`)
