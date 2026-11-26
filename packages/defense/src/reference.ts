import { IMAGES, type UnitInstance } from './roster.ts'

/**
 * 탄 난이도의 기준이 되는 덱 (2026-11-26 사용자 결정).
 * - 특수능력 없는 10명. 1탄 = 능력치 모두 최하, REFERENCE_MAX_STAGE 탄 = 모두 최고
 * - 그 사이는 10명 **합계**가 고르게 오름 (사거리는 2칸짜리 인원이 한 명씩 늘어남)
 * - n탄 몬스터 체력 = "n탄 기준 덱이 목숨 절반을 남기고 겨우 깨는 최대 체력" (scripts/calibrate.ts)
 */
export const REFERENCE_SIZE = 10
export const REFERENCE_MAX_STAGE = 70
/**
 * "겨우 깬다" = 시작 목숨 20 중 10 이상 남기고 깸 (사용자 결정: 목숨 절반).
 * 단 몬스터가 적은 탄(1탄 = 10마리 = 다 놓쳐도 목숨 10)에선 의미가 없으므로
 * 놓친 목숨 ≤ min(10, 그 탄에서 잃을 수 있는 목숨 전체의 절반)
 */
export const REFERENCE_TARGET_LIVES = 10

/** 기준 덱이 놓쳐도 되는 최대 목숨 */
export function referenceMaxLoss(startLives: number, stageTotalLeak: number): number {
  return Math.min(startLives - REFERENCE_TARGET_LIVES, Math.floor(stageTotalLeak / 2))
}

/** 합계 범위 [1탄, 최고 탄] */
const TOTALS = {
  atk: [10 * REFERENCE_SIZE, 30 * REFERENCE_SIZE],
  attackSpeed: [1 * REFERENCE_SIZE, 5 * REFERENCE_SIZE],
  agility: [5 * REFERENCE_SIZE, 10 * REFERENCE_SIZE],
  range2: [0, REFERENCE_SIZE],
} as const

/** 1탄 a → 최고 탄 b 사이를 정수로 고르게 (반올림) */
function lerp(a: number, b: number, n: number): number {
  const k = Math.min(Math.max(n, 1), REFERENCE_MAX_STAGE) - 1
  const span = REFERENCE_MAX_STAGE - 1
  return a + Math.floor(((b - a) * k * 2 + span) / (span * 2))
}

/** 합계 total 을 10명에게 나눔. 남는 +1 은 offset 부터 차례로 (능력치마다 다른 캐릭에게 몰리지 않게) */
const share = (total: number, i: number, offset: number) => Math.floor(total / REFERENCE_SIZE) + ((i + offset) % REFERENCE_SIZE < total % REFERENCE_SIZE ? 1 : 0)

export function referenceDeck(n: number): UnitInstance[] {
  const atk = lerp(...TOTALS.atk, n)
  const attackSpeed = lerp(...TOTALS.attackSpeed, n)
  const agility = lerp(...TOTALS.agility, n)
  const range2 = lerp(...TOTALS.range2, n)
  return Array.from({ length: REFERENCE_SIZE }, (_, i) => ({
    id: `ref${i + 1}`,
    image: IMAGES[i % IMAGES.length]!,
    atk: share(atk, i, 0),
    range: (i + 5) % REFERENCE_SIZE < range2 ? 2 : 1,
    attackSpeed: share(attackSpeed, i, 3),
    agility: share(agility, i, 7),
    ability: null,
  }))
}

/** 화면·로그용 요약: 평균 능력치 */
export function referenceSummary(n: number): string {
  const d = referenceDeck(n)
  const avg = (f: (u: UnitInstance) => number) => (d.reduce((s, u) => s + f(u), 0) / d.length).toFixed(1)
  return `공격 ${avg((u) => u.atk)} · 사거리2 ${d.filter((u) => u.range === 2).length}명 · 공속 ${avg((u) => u.attackSpeed)} · 민첩 ${avg((u) => u.agility)}`
}
