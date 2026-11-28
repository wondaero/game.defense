/**
 * 100탄 목표 맞추기 (2026-11-28 사용자: "무지개 10명 + 모두 특수능력 상급이어야 깨짐")
 * 덱 3종 × 체력 배율 여러 개로 100탄(우두머리 탄)을 돌려 깨는 비율을 봄
 *  - 무지개 + 특수능력 없음 / 무지개 + 특수능력 무작위(보통 값) / 무지개 + 특수능력 상급(종류 무작위, 값은 표의 최고)
 * 실행: npx vite-node scripts/check-top.ts   (STAGE=100, BPS=쉼표로 체력 배율 bp)
 */
import { ABILITY_KINDS, createRngState, createWave, makeConfig, MAP_DEFS, parseMap, Rng, rollAbility, rollRoster, runWave, smartPlace, stageDefWithHp, stageHpBp, statScore, type Ability, type UnitInstance } from '../packages/defense/src/index.ts'

const cfg = makeConfig()
const maps = Object.fromEntries(MAP_DEFS.map((d) => [d.id, parseMap(d)]))
const N = Number(process.env.STAGE ?? 100)
const rainbow: UnitInstance[] = []
for (let s = 1; rainbow.length < 240 && s < 4000; s++) for (const u of rollRoster(cfg, createRngState(`rb-${s}`)).units) if (statScore(cfg, { ...u, ability: null }) >= 88) rainbow.push({ ...u, id: `r${rainbow.length}` })

/** 특수능력 상급 = 그 종류에서 뽑힐 수 있는 가장 좋은 값 (장애물은 늪 60%) */
function topAbility(rng: Rng): Ability {
  const kind = ABILITY_KINDS[rng.int(ABILITY_KINDS.length)]!
  // 같은 종류가 나올 때까지 굴린 뒤 값만 최고로
  let a = rollAbility(rng)
  while (a.kind !== kind) a = rollAbility(rng)
  const max = (xs: readonly number[]) => Math.max(...xs)
  switch (a.kind) {
    case 'stun': return { ...a, chanceBp: 1500, durationMs: 1500 }
    case 'teamLevel': return { ...a, stat: 'all', level: 3 }
    case 'poison': return { ...a, chanceBp: 1000, pctBp: 4000 }
    case 'boostAll': return { ...a, mulBp: 13_000 }
    case 'frenzy': return { ...a, chanceBp: 1000, cooldownMs: 5000 }
    case 'hawkeye': return { ...a, plus: 3 }
    case 'obstacle': return { ...a, chanceBp: 1000, obstacle: 'slow', amountBp: 6000 }
    default: return { ...a, chanceBp: max([a.chanceBp, ...({ splash: [500], crit: [1000], recall: [500], allAttack: [500], hypnosis: [1000], instakill: [100], iceTile: [500], lullaby: [300], agiCopy: [1000], pierce: [1500] } as Record<string, number[]>)[a.kind]!]) } as Ability
  }
}

const DECKS = 12
const SEEDS = 5
const rng = new Rng(createRngState('abil'))
const base = Array.from({ length: DECKS }, (_, d) => rainbow.slice(d * 10, d * 10 + 10))
const sets = {
  없음: base.map((dk) => dk.map((u) => ({ ...u, ability: null }))),
  무작위: base.map((dk) => dk.map((u) => ({ ...u, ability: rollAbility(rng) }))),
  상급: base.map((dk) => dk.map((u) => ({ ...u, ability: topAbility(rng) }))),
}
const now = stageHpBp(N)
const bps = (process.env.BPS ?? `${now}`).split(',').map(Number)
console.log(`${N}탄 · 지금 체력 배율 ${now} · 덱 ${DECKS} × 판 ${SEEDS}`)
for (const bp of bps) {
  const st = stageDefWithHp(N, bp)
  const map = maps[st.mapId]!
  const out = Object.entries(sets).map(([name, decks]) => {
    let c = 0
    let t = 0
    for (const dk of decks) {
      const p = smartPlace(cfg, map, dk)
      for (let s = 1; s <= SEEDS; s++) {
        t++
        if (runWave(createWave(cfg, map, st, dk, p, cfg.startLives, s * 7919 + N)).cleared) c++
      }
    }
    return `${name} ${String(Math.round((c / t) * 100)).padStart(3)}%`
  })
  console.log(`배율 ${String(bp).padStart(6)} | ${out.join(' | ')}`)
}
