import type { AbilityKind } from './abilities.ts'
import { MAP_DEFS } from './maps.ts'
import { seedFromString, Rng } from './rng.ts'

/**
 * 탄(스테이지) = 웨이브 하나. 1~100탄은 공식으로 만들고, 101탄부터는 같은 공식으로 무한.
 * 같은 탄 번호면 항상 같은 구성 (공유 기록 검증용).
 *
 * 난이도 곡선: 체력·방어·마릿수가 탄마다 오르고, 10탄부터 몬스터 특수능력이 붙는다.
 * 70탄쯤이면 평범한 덱으로는 매우 어렵게 (test/balance 로 확인).
 */

export type MonsterId = 'normal' | 'fast' | 'tank' | 'boss'
export type MonsterAbilityKind = 'armorUp' | 'freeze'

/** 몬스터 종류의 기본값 (1탄 기준) */
export interface MonsterBase {
  id: MonsterId
  name: string
  hp: number
  armor: number
  /** 민첩. 내 명중률 = 내 민첩 ÷ (내 민첩 + 몬스터 민첩) */
  agility: number
  /** 1초에 가는 거리 (1000 = 1초에 1칸) */
  speed: number
  /** 출구까지 가면 깎이는 목숨 */
  leak: number
  color: string
  size: number
}

export const MONSTER_BASES: Readonly<Record<MonsterId, MonsterBase>> = {
  normal: { id: 'normal', name: '보통', hp: 60, armor: 2, agility: 5, speed: 1000, leak: 1, color: '#7cb342', size: 0.22 },
  fast: { id: 'fast', name: '날쌘돌이', hp: 40, armor: 0, agility: 9, speed: 1800, leak: 1, color: '#fdd835', size: 0.17 },
  tank: { id: 'tank', name: '단단이', hp: 200, armor: 6, agility: 3, speed: 750, leak: 2, color: '#8d6e63', size: 0.28 },
  boss: { id: 'boss', name: '우두머리', hp: 700, armor: 5, agility: 6, speed: 700, leak: 5, color: '#e53935', size: 0.36 },
}

/** 몬스터 특수능력 (수치는 탄에 따라 오름). 쿨타임은 능력 종류마다 고정 */
export interface MonsterAbilityDef {
  name: string
  cooldownMs: number
  durationMs: number
}

export const MONSTER_ABILITIES: Readonly<Record<MonsterAbilityKind, MonsterAbilityDef>> = {
  armorUp: { name: '단단해지기', cooldownMs: 10_000, durationMs: 3000 },
  freeze: { name: '얼리기', cooldownMs: 6000, durationMs: 2000 },
}

/** 얼었다 풀린 캐릭은 이 시간 동안 다시 얼지 않음 (계속 얼어 있는 것 방지) */
export const FREEZE_IMMUNE_MS = 3000


/** 이 탄에서 실제로 쓰는 몬스터 능력치 */
export interface MonsterSpec {
  id: MonsterId
  name: string
  hp: number
  armor: number
  agility: number
  speed: number
  leak: number
  abilities: MonsterAbilityKind[]
  /** 단단해지기: 올라가는 방어력 */
  armorUpAmount: number
  /** 얼리기: 몬스터 칸에서 몇 칸 안의 캐릭을 얼리나 (마름모) */
  freezeRadius: number
  /** 이 캐릭 특수능력에 안 걸림 (몬스터 성질, 아직 쓰는 탄 없음) */
  immunities: AbilityKind[]
  color: string
  size: number
}

export interface StageGroup {
  monster: MonsterId
  count: number
  delayMs: number
  intervalMs: number
}

export interface StageDef {
  stage: number
  mapId: string
  /** 판 안 확률(명중 등)에 쓰는 시드 */
  seed: number
  monsters: Partial<Record<MonsterId, MonsterSpec>>
  groups: StageGroup[]
  isBoss: boolean
}

export const LAST_NORMAL_STAGE = 100
/** 탄마다 체력 배율 (1.02 → 70탄 ≈ 3.9배, 100탄 ≈ 7.1배. 방어력·마릿수·능력도 같이 오름) */
export const HP_GROWTH = 1.02

export function monsterAbilityDesc(kind: MonsterAbilityKind, spec: MonsterSpec): string {
  const d = MONSTER_ABILITIES[kind]
  const sec = (ms: number) => `${ms / 1000}초`
  switch (kind) {
    case 'armorUp':
      return `맞으면 ${sec(d.durationMs)} 동안 방어력 +${spec.armorUpAmount} (쿨타임 ${sec(d.cooldownMs)})`
    case 'freeze':
      return `지나가면서 ${spec.freezeRadius}칸 안의 캐릭을 ${sec(d.durationMs)} 동안 얼림 — 공격 못 함 (쿨타임 ${sec(d.cooldownMs)}, 풀린 캐릭은 ${FREEZE_IMMUNE_MS / 1000}초간 안 얼음)`
  }
}

/** n 탄 구성 */
export function stageDef(n: number): StageDef {
  if (!Number.isInteger(n) || n < 1) throw new Error(`잘못된 탄: ${n}`)
  const seed = seedFromString(`stage-${n}`)
  const rng = new Rng({ s: seed })
  // 맵: 5탄마다 번갈아
  const mapId = MAP_DEFS[Math.floor((n - 1) / 5) % MAP_DEFS.length]!.id
  const isBoss = n % 10 === 0

  // 체력: 탄마다 복리로 오름 (HP_GROWTH 참고)
  const hpMul = Math.pow(HP_GROWTH, n - 1)
  const armorAdd = Math.floor(n / 10)
  const speedMulBp = Math.min(14_000, 10_000 + n * 40)

  // 몬스터 능력 (탄마다 어느 종류가 무엇을 갖는지 바뀜)
  //   1~9탄: 우두머리만 / 10~29탄: 한 종류만 1개 / 30~49탄: 두 종류가 1개씩
  //   50~69탄: 모든 종류가 1개씩 / 70탄부터: 모든 종류가 전부 (여기서 크게 어려워짐)
  const abilityPool: MonsterAbilityKind[] = ['armorUp', 'freeze']
  const types: MonsterId[] = ['normal']
  if (n >= 3) types.push('fast')
  if (n >= 6) types.push('tank')
  if (isBoss) types.push('boss')
  const order = [...types]
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  const withAbility = n < 10 ? 0 : n < 30 ? 1 : n < 50 ? 2 : order.length
  const abilitiesFor = (t: MonsterId): MonsterAbilityKind[] => {
    if (n >= 70) return [...abilityPool]
    if (n < 10) return t === 'boss' ? ['armorUp'] : []
    return order.indexOf(t) < withAbility ? [abilityPool[rng.int(abilityPool.length)]!] : []
  }

  const monsters: StageDef['monsters'] = {}
  for (const t of types) {
    const b = MONSTER_BASES[t]
    monsters[t] = {
      id: t,
      name: b.name,
      hp: Math.round(b.hp * hpMul),
      armor: b.armor + armorAdd,
      // 민첩: 25탄마다 +1 (임시)
      agility: b.agility + Math.floor(n / 25),
      speed: Math.floor((b.speed * speedMulBp) / 10_000),
      leak: b.leak,
      abilities: abilitiesFor(t),
      armorUpAmount: 4 + Math.floor(n / 10),
      freezeRadius: n >= 60 ? 2 : 1,
      immunities: [],
      color: b.color,
      size: b.size,
    }
  }

  // 마릿수·간격
  // 우두머리 탄은 일반 몬스터를 60%만 (우두머리가 몫을 채움)
  const count = Math.floor(Math.min(35, 10 + Math.floor(n / 4)) * (isBoss ? 0.6 : 1))
  const interval = Math.max(500, 1200 - n * 5)
  const groups: StageGroup[] = []
  const nFast = n >= 3 ? Math.floor(count * 0.3) : 0
  const nTank = n >= 6 ? Math.floor(count * 0.2) : 0
  const nNormal = count - nFast - nTank
  groups.push({ monster: 'normal', count: nNormal, delayMs: 0, intervalMs: interval })
  if (nFast) groups.push({ monster: 'fast', count: nFast, delayMs: 2000, intervalMs: Math.floor(interval * 0.8) })
  if (nTank) groups.push({ monster: 'tank', count: nTank, delayMs: 4000, intervalMs: interval * 2 })
  if (isBoss) groups.push({ monster: 'boss', count: n >= 50 ? 2 : 1, delayMs: Math.floor((nNormal * interval) / 2), intervalMs: 4000 })

  return { stage: n, mapId, seed, monsters, groups, isBoss }
}

/** 탄 정보 화면용: 종류별 마릿수 */
export function stageSummary(s: StageDef): { spec: MonsterSpec; count: number }[] {
  const by = new Map<MonsterId, number>()
  for (const g of s.groups) by.set(g.monster, (by.get(g.monster) ?? 0) + g.count)
  return [...by].map(([id, count]) => ({ spec: s.monsters[id]!, count }))
}
