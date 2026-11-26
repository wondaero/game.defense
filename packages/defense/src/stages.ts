import type { AbilityKind } from './abilities.ts'
import { MAP_DEFS } from './maps.ts'
import { REFERENCE_MAX_STAGE } from './reference.ts'
import { seedFromString, Rng } from './rng.ts'
import { STAGE_HP_BP } from './stageHp.ts'

/**
 * 탄(스테이지) = 웨이브 하나. 1~100탄 + 101탄부터 무한. 같은 탄 번호면 항상 같은 구성 (공유 기록 검증용).
 *
 * 난이도 (2026-11-26 사용자 결정):
 * - 마릿수·방어·민첩·속도·몬스터 능력은 공식
 * - **체력은 기준 덱(reference.ts)으로 보정한 표**(stageHp.ts, `npm run calibrate` 로 생성):
 *   n탄 체력 = n탄 기준 덱(특수능력 없는 10명, 1탄 최하 → 70탄 최고)이 목숨 절반을 남기고 겨우 깨는 최대 체력
 * - 71탄부터(무한 포함) 70탄 체력에서 탄마다 +3% (능력치 최고 덱도 특수능력 없이는 못 깸)
 */

export type MonsterId = 'normal' | 'fast' | 'tank' | 'boss'
/** 몬스터 특수능력 (사용자 작성 docs/spec 1~8번 + 예전 단단해지기) */
export type MonsterAbilityKind = 'freeze' | 'fullHeal' | 'groupHeal' | 'haste' | 'blink' | 'invincible' | 'scatter' | 'weaken' | 'armorUp'

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

/** 기본 체력 = 종류끼리의 비율. 실제 체력은 탄별 배율(stageHpBp)을 곱함 */
export const MONSTER_BASES: Readonly<Record<MonsterId, MonsterBase>> = {
  normal: { id: 'normal', name: '보통', hp: 60, armor: 2, agility: 5, speed: 1000, leak: 1, color: '#7cb342', size: 0.22 },
  fast: { id: 'fast', name: '날쌘돌이', hp: 40, armor: 0, agility: 9, speed: 1800, leak: 1, color: '#fdd835', size: 0.17 },
  tank: { id: 'tank', name: '단단이', hp: 200, armor: 6, agility: 3, speed: 750, leak: 2, color: '#8d6e63', size: 0.28 },
  boss: { id: 'boss', name: '우두머리', hp: 700, armor: 5, agility: 6, speed: 700, leak: 5, color: '#e53935', size: 0.36 },
}

/**
 * 몬스터 특수능력. 모두 **캐릭에게 공격받을 때(빗나가도) 판정** (2026-11-26 사용자 결정).
 * - chanceBp: 발동 확률 / cooldownMs: 쿨타임 / uses: 몬스터 한 마리당 횟수 (0 = 제한 없음)
 * - 캐릭에게 거는 것(얼리기·날려 보내기·약화)은 캐릭이 민첩으로 피할 수 있음
 */
export interface MonsterAbilityDef {
  name: string
  icon: string
  chanceBp: number
  cooldownMs: number
  durationMs: number
  uses: number
}

export const MONSTER_ABILITIES: Readonly<Record<MonsterAbilityKind, MonsterAbilityDef>> = {
  // 1. 30% 확률로 주변 3×3 캐릭 1초 얼림 / 쿨 2초
  freeze: { name: '얼리기', icon: '❄', chanceBp: 3000, cooldownMs: 2000, durationMs: 1000, uses: 0 },
  // 2. 20% 확률로 체력 완전 회복 / 판당 1회
  fullHeal: { name: '완전 회복', icon: '✚', chanceBp: 2000, cooldownMs: 0, durationMs: 0, uses: 1 },
  // 3. 몬스터 전체 최대 체력 10% 회복 / 판당 1회 (확률은 spec 에 없어 *임시* 10%)
  groupHeal: { name: '전체 회복', icon: '♥', chanceBp: 1000, cooldownMs: 0, durationMs: 0, uses: 1 },
  // 4. 10% 확률로 이동속도 2배 / 판당 1회 (지속 *임시* 3초)
  haste: { name: '질주', icon: '»', chanceBp: 1000, cooldownMs: 0, durationMs: 3000, uses: 1 },
  // 5. 10% 확률로 앞으로 3칸 순간이동 / 판당 2회
  blink: { name: '순간이동', icon: '↯', chanceBp: 1000, cooldownMs: 0, durationMs: 0, uses: 2 },
  // 6. 5% 확률로 2초 무적 / 쿨 10초
  invincible: { name: '무적', icon: '★', chanceBp: 500, cooldownMs: 10_000, durationMs: 2000, uses: 0 },
  // 7. 3% 확률로 때린 캐릭을 무작위 빈칸으로 / 쿨 5초
  scatter: { name: '날려 보내기', icon: '⤴', chanceBp: 300, cooldownMs: 5000, durationMs: 0, uses: 0 },
  // 8. 10% 확률로 때린 캐릭 5초간 공속·명중률 절반 / 쿨 20초
  weaken: { name: '약화', icon: '↓', chanceBp: 1000, cooldownMs: 20_000, durationMs: 5000, uses: 0 },
  // 9. (예전) 맞으면 3초간 방어력 + / 쿨 10초
  armorUp: { name: '단단해지기', icon: '🛡', chanceBp: 10_000, cooldownMs: 10_000, durationMs: 3000, uses: 0 },
}

/** 판정 순서 (한 공격에 여러 능력이 있으면 이 순서로 굴림 → 결정성) */
export const MONSTER_ABILITY_KINDS: readonly MonsterAbilityKind[] = ['invincible', 'fullHeal', 'groupHeal', 'haste', 'blink', 'freeze', 'scatter', 'weaken', 'armorUp']

/** 얼었다 풀린 캐릭은 이 시간 동안 다시 얼지 않음 (계속 얼어 있는 것 방지, *임시*) */
export const FREEZE_IMMUNE_MS = 3000
/** 순간이동 거리 (칸) */
export const BLINK_CELLS = 3
/** 전체 회복량 (최대 체력의 basis point) */
export const GROUP_HEAL_BP = 1000

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
/** 71탄부터 체력이 탄마다 오르는 비율 (+3%) */
export const HP_GROWTH_AFTER_BP = 10_300
/** 체력 배율 상한 (정수 범위 안전) */
const HP_BP_CAP = 1e13

/** n 탄 체력 배율 (basis point, MONSTER_BASES 기본 체력에 곱함). 표가 없으면(보정 전) 100% */
export function stageHpBp(n: number): number {
  const last = Math.min(n, REFERENCE_MAX_STAGE)
  let bp = STAGE_HP_BP[last - 1] ?? 10_000
  for (let k = REFERENCE_MAX_STAGE + 1; k <= n && bp < HP_BP_CAP; k++) bp = Math.floor((bp * HP_GROWTH_AFTER_BP) / 10_000)
  return Math.min(bp, HP_BP_CAP)
}

export function monsterAbilityDesc(kind: MonsterAbilityKind, spec: MonsterSpec): string {
  const d = MONSTER_ABILITIES[kind]
  const sec = (ms: number) => `${ms / 1000}초`
  const pct = `${d.chanceBp / 100}%`
  const tail = d.uses ? ` · 마리당 ${d.uses}회` : d.cooldownMs ? ` (쿨타임 ${sec(d.cooldownMs)})` : ''
  const dodge = ' — 민첩으로 피할 수 있음'
  switch (kind) {
    case 'freeze':
      return `맞으면 ${pct} 확률로 주변 3×3 캐릭을 ${sec(d.durationMs)} 얼림${tail}, 풀린 캐릭은 ${FREEZE_IMMUNE_MS / 1000}초간 안 얼음${dodge}`
    case 'fullHeal':
      return `맞으면 ${pct} 확률로 체력을 전부 회복${tail}`
    case 'groupHeal':
      return `맞으면 ${pct} 확률로 판 위 몬스터 전체가 최대 체력의 ${GROUP_HEAL_BP / 100}% 회복${tail}`
    case 'haste':
      return `맞으면 ${pct} 확률로 ${sec(d.durationMs)} 동안 이동속도 2배${tail}`
    case 'blink':
      return `맞으면 ${pct} 확률로 앞으로 ${BLINK_CELLS}칸 순간이동${tail}`
    case 'invincible':
      return `맞으면 ${pct} 확률로 ${sec(d.durationMs)} 동안 무적 (피해·스턴·출발지로 보내기 안 통함)${tail}`
    case 'scatter':
      return `맞으면 ${pct} 확률로 때린 캐릭을 무작위 빈 배치 칸으로 날려 보냄${tail}${dodge}`
    case 'weaken':
      return `맞으면 ${pct} 확률로 때린 캐릭의 공속·명중률을 ${sec(d.durationMs)} 동안 절반으로${tail}${dodge}`
    case 'armorUp':
      return `맞으면 ${sec(d.durationMs)} 동안 방어력 +${spec.armorUpAmount}${tail}`
  }
}

/** n 탄 구성 */
export function stageDef(n: number): StageDef {
  return stageDefWithHp(n, stageHpBp(n))
}

/** 체력 배율을 직접 주는 n 탄 구성 (보정 스크립트용) */
export function stageDefWithHp(n: number, hpBp: number): StageDef {
  if (!Number.isInteger(n) || n < 1) throw new Error(`잘못된 탄: ${n}`)
  const seed = seedFromString(`stage-${n}`)
  const rng = new Rng({ s: seed })
  // 맵: 5탄마다 번갈아
  const mapId = MAP_DEFS[Math.floor((n - 1) / 5) % MAP_DEFS.length]!.id
  const isBoss = n % 10 === 0

  const armorAdd = Math.floor(n / 10)
  const speedMulBp = Math.min(14_000, 10_000 + n * 40)

  // 몬스터 능력 (탄마다 어느 종류가 무엇을 갖는지 바뀜)
  //   1~9탄: 우두머리만 / 10~29탄: 한 종류만 1개 / 30~49탄: 두 종류가 1개씩
  //   50~69탄: 모든 종류가 1개씩 / 70탄부터: 모든 종류가 2개씩 (*임시*, 예전엔 '전부')
  const abilityPool: readonly MonsterAbilityKind[] = MONSTER_ABILITY_KINDS
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
    if (n < 10) return t === 'boss' ? ['armorUp'] : []
    if (order.indexOf(t) >= withAbility) return []
    // 겹치지 않게 뽑고, 판정 순서(MONSTER_ABILITY_KINDS)대로 정렬
    const pool = [...abilityPool]
    const picked: MonsterAbilityKind[] = []
    for (let k = 0; k < (n >= 70 ? 2 : 1); k++) picked.push(pool.splice(rng.int(pool.length), 1)[0]!)
    return abilityPool.filter((a) => picked.includes(a))
  }

  const monsters: StageDef['monsters'] = {}
  for (const t of types) {
    const b = MONSTER_BASES[t]
    monsters[t] = {
      id: t,
      name: b.name,
      hp: Math.max(1, Math.floor((b.hp * hpBp) / 10_000)),
      armor: b.armor + armorAdd,
      // 민첩: 25탄마다 +1 (임시)
      agility: b.agility + Math.floor(n / 25),
      speed: Math.floor((b.speed * speedMulBp) / 10_000),
      leak: b.leak,
      abilities: abilitiesFor(t),
      armorUpAmount: 4 + Math.floor(n / 10),
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
