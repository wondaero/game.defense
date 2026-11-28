/**
 * 난이도 점검 (2026-11-28): "무지개(88점+) 10명이면 n탄을 깨나?"
 * 무작위 막사에서 무지개만 10명 골라(특수능력 있는 그대로 / 없앤 채로) 스마트 배치 → 판 씨앗 여러 개로 돌려 깨는 비율·별 평균
 * 실행: npx vite-node scripts/check-rainbow.ts
 */
import { createRngState, createWave, makeConfig, MAP_DEFS, parseMap, rollRoster, runWave, smartPlace, stageDef, statScore, type UnitInstance } from '../packages/defense/src/index.ts'

const cfg = makeConfig()
const maps = Object.fromEntries(MAP_DEFS.map((d) => [d.id, parseMap(d)]))

// 무지개 캐릭 모으기 (여러 막사를 굴려서)
const rainbow: UnitInstance[] = []
for (let s = 1; rainbow.length < 400 && s < 4000; s++) {
  for (const u of rollRoster(cfg, createRngState(`rb-${s}`)).units) if (statScore(cfg, { ...u, ability: null }) >= 88) rainbow.push({ ...u, id: `r${rainbow.length}` })
}
const DECKS = 12
const SEEDS = 6
const decks = Array.from({ length: DECKS }, (_, d) => rainbow.slice(d * 10, d * 10 + 10))

function run(n: number, withAbility: boolean) {
  const st = stageDef(n)
  const map = maps[st.mapId]!
  let clear = 0
  let stars = 0
  let total = 0
  for (const deck of decks) {
    const ros = withAbility ? deck : deck.map((u) => ({ ...u, ability: null }))
    const p = smartPlace(cfg, map, ros)
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = runWave(createWave(cfg, map, st, ros, p, cfg.startLives, seed * 7919 + n))
      total++
      if (r.cleared) clear++
      stars += r.stars
    }
  }
  return `${Math.round((clear / total) * 100)}%`.padStart(4) + ` 별 ${(stars / total).toFixed(1)}`
}

console.log(`무지개 ${rainbow.length}명 중 덱 ${DECKS}개 × 판 ${SEEDS}번 (스마트 배치)`)
console.log('탄    | 특수능력 그대로 | 특수능력 없이')
for (const n of (process.env.STAGES ?? "50,60,70,80,90,100").split(",").map(Number)) console.log(`${String(n).padStart(3)}탄 | ${run(n, true)}      | ${run(n, false)}`)
