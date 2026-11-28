/**
 * 탄별 몬스터 체력 보정 → packages/defense/src/stageHp.ts
 * 실행: npm run calibrate  (규칙·몬스터·맵·기준 덱을 바꾸면 다시 실행)
 *
 * n탄 체력 배율 = n탄 기준 덱(reference.ts)이 자동 배치(autoplace.ts)로
 *   겨우 깨는(2마리까지 통과) 최대 배율.
 *   0.5% 정밀도 이진 탐색.
 * 71~100탄 (2026-11-28): 무지개 덱 여러 개 × 판 씨앗 여러 개로, 깨는 비율이 절반이 되는 배율.
 *   덱 = 무작위 무지개 10명, 그중 k = (n − 70) / 3 명(반올림, 최대 10)이 특수능력 상급 → 100탄 = 10명 모두 상급.
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
  createRngState,
  rollRoster,
  smartPlace,
  statScore,
  TOP_TARGET_STAGE,
  topAbility,
  type UnitInstance,
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

// ── 71~100탄: 무지개 + 특수능력 상급 k명 ──
const rainbow: UnitInstance[] = []
for (let sd = 1; rainbow.length < 60 && sd < 4000; sd++) for (const u of rollRoster(cfg, createRngState(`cal-rb-${sd}`)).units) if (statScore(cfg, { ...u, ability: null }) >= 88) rainbow.push({ ...u, ability: null, id: `c${rainbow.length}` })
const DECKS = 5
const SEEDS = 3
function topDecks(n: number): UnitInstance[][] {
  const k = Math.min(10, Math.round((n - REFERENCE_MAX_STAGE) / 3))
  return Array.from({ length: DECKS }, (_, d) => rainbow.slice(d * 10, d * 10 + 10).map((u, i) => (i < k ? { ...u, ability: topAbility(d * 7 + i * 3) } : u)))
}
function passRate(n: number, hpBp: number): number {
  const st = stageDefWithHp(n, hpBp)
  const map = maps[st.mapId]!
  let ok = 0
  for (const deck of topDecks(n)) {
    const p = smartPlace(cfg, map, deck)
    for (let s = 1; s <= SEEDS; s++) if (runWave(createWave(cfg, map, st, deck, p, cfg.startLives, s * 7919 + n)).cleared) ok++
  }
  return ok / (DECKS * SEEDS)
}
function calibrateTop(n: number): number {
  let lo = 1
  let hi = 4000
  while (passRate(n, hi) >= 0.5) {
    lo = hi
    hi *= 2
  }
  while (hi - lo > Math.max(1, Math.floor(lo / 50))) {
    const mid = Math.floor((lo + hi) / 2)
    if (passRate(n, mid) >= 0.5) lo = mid
    else hi = mid
  }
  return lo
}
for (let n = REFERENCE_MAX_STAGE + 1; n <= TOP_TARGET_STAGE; n++) {
  const bp = calibrateTop(n)
  table.push(bp)
  console.log(`${String(n).padStart(3)}탄  체력 ${(bp / 100).toFixed(1).padStart(8)}%   무지개 + 상급 ${Math.min(10, Math.round((n - REFERENCE_MAX_STAGE) / 3))}명 (절반이 깸)`)
}

const out = fileURLToPath(new URL('../packages/defense/src/stageHp.ts', import.meta.url))
const rows: string[] = []
for (let i = 0; i < table.length; i += 10) rows.push('  ' + table.slice(i, i + 10).join(', ') + ',')
writeFileSync(
  out,
  `// npm run calibrate 가 만든 파일 (직접 고치지 말 것). ${new Date().toISOString().slice(0, 10)}
// n탄 몬스터 체력 배율 (basis point, 10000 = 기본 체력). 1~70탄: 기준 덱이 겨우 깸 / 71~100탄: 무지개 + 상급 k명 덱의 절반이 깸
export const STAGE_HP_BP: readonly number[] = [
${rows.join('\n')}
]
`,
)
console.log(`\n${out} 저장 (${((Date.now() - t0) / 1000).toFixed(1)}초)`)
