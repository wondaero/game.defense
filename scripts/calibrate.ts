/**
 * 탄별 몬스터 체력 보정 → packages/defense/src/stageHp.ts
 * 실행: npm run calibrate  (규칙·몬스터·맵·기준 덱을 바꾸면 다시 실행)
 *
 * n탄 체력 배율 = n탄 기준 덱(reference.ts)이 자동 배치(autoplace.ts)로
 *   겨우 깨는(2마리까지 통과) 최대 배율.
 *   0.5% 정밀도 이진 탐색.
 * 엔진이 결정적이라 같은 규칙이면 항상 같은 표가 나온다.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  autoPlace,
  createWave,
  DEFAULT_CONFIG,
  MAP_DEFS,
  parseMap,
  REFERENCE_MAX_STAGE,
  referenceDeck,
  referencePasses,
  referenceSummary,
  runWave,
  stageDefWithHp,
  type GameMap,
} from '../packages/defense/src/index.ts'

const cfg = { ...DEFAULT_CONFIG }
const maps = Object.fromEntries(MAP_DEFS.map((d) => [d.id, parseMap(d)])) as Record<string, GameMap>

function passes(n: number, hpBp: number): boolean {
  const st = stageDefWithHp(n, hpBp)
  const map = maps[st.mapId]!
  const deck = referenceDeck(n)
  const r = runWave(createWave(cfg, map, st, deck, autoPlace(cfg, map, deck), cfg.startLives))
  return referencePasses(r)
}

function calibrate(n: number): number {
  if (!passes(n, 1)) return 1 // 체력 1이어도 못 깨면 (마릿수·속도 문제) 최소값
  let lo = 1
  let hi = 10_000
  while (passes(n, hi)) {
    lo = hi
    hi *= 2
    if (hi > 1e12) throw new Error(`${n}탄: 체력을 아무리 올려도 통과 — 통과 조건 확인 필요`)
  }
  // lo 는 통과, hi 는 실패
  while (hi - lo > Math.max(1, Math.floor(lo / 200))) {
    const mid = Math.floor((lo + hi) / 2)
    if (passes(n, mid)) lo = mid
    else hi = mid
  }
  return lo
}

const table: number[] = []
const t0 = Date.now()
for (let n = 1; n <= REFERENCE_MAX_STAGE; n++) {
  const bp = calibrate(n)
  table.push(bp)
  console.log(`${String(n).padStart(3)}탄  체력 ${(bp / 100).toFixed(1).padStart(8)}%   기준 덱: ${referenceSummary(n)}`)
}

const out = fileURLToPath(new URL('../packages/defense/src/stageHp.ts', import.meta.url))
const rows: string[] = []
for (let i = 0; i < table.length; i += 10) rows.push('  ' + table.slice(i, i + 10).join(', ') + ',')
writeFileSync(
  out,
  `// npm run calibrate 가 만든 파일 (직접 고치지 말 것). ${new Date().toISOString().slice(0, 10)}
// n탄 몬스터 체력 배율 (basis point, 10000 = 기본 체력). 기준 덱이 목숨 절반을 남기고 겨우 깨는 최대값
export const STAGE_HP_BP: readonly number[] = [
${rows.join('\n')}
]
`,
)
console.log(`\n${out} 저장 (${((Date.now() - t0) / 1000).toFixed(1)}초)`)
