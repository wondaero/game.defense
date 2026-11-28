import { rollAbility } from './abilities.ts'
import type { DefenseConfig } from './config.ts'
import type { Rng } from './rng.ts'
import { IMAGES, rollUnit, type UnitInstance } from './roster.ts'

/**
 * 막사 (2026-11-27): 캐릭 뽑기 · 능력치 변경 · 특수능력 변경 · 합성. 규칙은 docs/design.md 6장.
 * 나중에 서버가 같은 함수를 돌림 (난수는 Rng 로만 → 같은 씨앗이면 같은 결과)
 */

/** 권 종류 */
export type TicketKind = 'draw' | 'statNormal' | 'statHigh' | 'statTop' | 'ability' | 'abilityGrant'
export type Tickets = Record<TicketKind, number>

export const TICKET_NAMES: Readonly<Record<TicketKind, string>> = {
  // '변경 티켓' 사이는 줄바꿈 안 되는 빈칸(\u00a0): 좁은 화면에서 "특수능력 변경 / 티켓" 처럼 티켓만 떨어지지 않게 (2026-11-28 권 → 티켓)
  draw: '뽑기\u00a0티켓',
  statNormal: '능력치 변경\u00a0티켓(보통)',
  statHigh: '능력치 변경\u00a0티켓(상급)',
  statTop: '능력치 변경\u00a0티켓(최상급)',
  ability: '특수능력 변경\u00a0티켓',
  /** 2026-11-28: 특수능력 없는 캐릭에 특수능력을 하나 붙임 (합성 30명 · 상점 3000) */
  abilityGrant: '특수능력 부여\u00a0티켓',
}

/** 첫 시작 지급 (확정): 뽑기권 5 · 특수능력 변경권 1 · 능력치 변경권(보통) 3 */
export const START_TICKETS: Readonly<Tickets> = { draw: 5, statNormal: 3, statHigh: 0, statTop: 0, ability: 1, abilityGrant: 0 }

/** 막사 최대 인원 = cfg.rosterSize (100) */
export const barracksFull = (cfg: DefenseConfig, units: readonly UnitInstance[]) => units.length >= cfg.rosterSize

/** 능력치 4개 */
export type StatKey = 'atk' | 'range' | 'attackSpeed' | 'agility'
export const STAT_KEYS: readonly StatKey[] = ['atk', 'range', 'attackSpeed', 'agility']
export const STAT_KEY_NAMES: Readonly<Record<StatKey, string>> = { atk: '공격력', range: '사거리', attackSpeed: '공속', agility: '민첩' }

/** 능력치 변경권마다 골라서 유지하는 개수: 보통 0 · 상급 1 · 최상급 2 */
export const STAT_TICKET_KEEP: Readonly<Record<'statNormal' | 'statHigh' | 'statTop', number>> = { statNormal: 0, statHigh: 1, statTop: 2 }

/** 특수능력 없는 캐릭에 능력치 변경권을 쓰면 이 확률로 특수능력이 생김 (5%) */
export const STAT_TICKET_ABILITY_BP = 500

/** 캐릭 뽑기: 그림은 8종 중 아무거나 */
export function drawUnit(cfg: DefenseConfig, rng: Rng, id: string): UnitInstance {
  const image = IMAGES[rng.int(IMAGES.length)]!
  return rollUnit(cfg, rng, id, image)
}

/**
 * 능력치 변경권: keep 에 든 능력치는 그대로, 나머지는 다시 뽑음 (각각 균등).
 * 특수능력은 그대로 (없어지지 않음). 없던 캐릭은 5% 확률로 새로 생김
 */
export function rerollStats(cfg: DefenseConfig, rng: Rng, u: UnitInstance, keep: readonly StatKey[]): UnitInstance {
  const range = { atk: cfg.atk, range: cfg.range, attackSpeed: cfg.attackSpeed, agility: cfg.agility }
  const out: UnitInstance = { ...u }
  for (const k of STAT_KEYS) if (!keep.includes(k)) out[k] = rng.range(range[k].min, range[k].max)
  if (!u.ability && rng.int(10_000) < STAT_TICKET_ABILITY_BP) out.ability = rollAbility(rng)
  return out
}

/** 특수능력 변경권: 특수능력만 다시 (종류·수치 새로). 특수능력 없는 캐릭엔 못 씀 → null */
export function rerollAbility(rng: Rng, u: UnitInstance): UnitInstance | null {
  if (!u.ability) return null
  return { ...u, ability: rollAbility(rng) }
}

/** 합성: 넣는 캐릭 수 → 받는 권 (확정). 이 수 말고는 합성 안 됨 */
export const MERGE_TABLE: Readonly<Record<number, TicketKind>> = { 3: 'statNormal', 5: 'draw', 8: 'statHigh', 10: 'ability', 12: 'statTop', 30: 'abilityGrant' }
export const MERGE_COUNTS = [3, 5, 8, 10, 12] as const

/**
 * 합성 (2026-11-28 바꿈): 만들 권을 먼저 고르고 → 그 권의 필요 인원 배수만큼 넣으면 그 수만큼 받음.
 * 예) 능력치 변경권(보통) 3명 몫 → 12명 넣으면 4장. 보통은 장마다 따로 1% 최상급 · 5% 상급 행운
 */
export const MERGE_COST: Readonly<Record<TicketKind, number>> = { statNormal: 3, draw: 5, statHigh: 8, ability: 10, statTop: 12, abilityGrant: 30 }

/** target 권으로 count 명 합성 → 받는 권 목록. 배수가 아니면 null */
export function mergeRewards(rng: Rng, target: TicketKind, count: number): TicketKind[] | null {
  const cost = MERGE_COST[target]
  if (!cost || count < cost || count % cost !== 0) return null
  return Array.from({ length: count / cost }, () => (target === 'statNormal' ? mergeReward(rng, 3)! : target))
}

/** 3명 합성 = 능력치 변경권(보통), 단 1% 최상급 · 5% 상급이 대신 나옴 */
export function mergeReward(rng: Rng, count: number): TicketKind | null {
  const base = MERGE_TABLE[count]
  if (!base) return null
  if (count !== 3) return base
  const r = rng.int(10_000)
  return r < 100 ? 'statTop' : r < 600 ? 'statHigh' : 'statNormal'
}
