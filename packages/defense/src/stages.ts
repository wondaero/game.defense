import type { AbilityKind } from './abilities.ts'
import { MAP_DEFS } from './maps.ts'
import { MAP_ORDER } from './mapOrder.ts'
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

/**
 * 몬스터 12종 (사용자 docs/spec, 2026-11-27): 능력치 4가지(체력·방어·민첩·속도) 조합
 * 보통 1 + 한 가지 높은 4 + 두 가지 높은 6 = 11 + 보스(3가지 이상 섞음) = 12
 */
export type MonsterId =
  | 'normal'
  | 'hp'
  | 'armor'
  | 'agi'
  | 'spd'
  | 'hp_armor'
  | 'hp_agi'
  | 'hp_spd'
  | 'armor_agi'
  | 'armor_spd'
  | 'agi_spd'
  | 'boss'
/** 몬스터 능력치 특성 */
export type MonsterTrait = 'hp' | 'armor' | 'agi' | 'spd'
export const MONSTER_TRAITS: readonly MonsterTrait[] = ['hp', 'armor', 'agi', 'spd']
export const TRAIT_NAMES: Readonly<Record<MonsterTrait, string>> = { hp: '체력', armor: '방어', agi: '민첩', spd: '속도' }
/** 몬스터 특수능력 (사용자 작성 docs/spec 1~8번 + 예전 단단해지기) */
export type MonsterAbilityKind = 'freeze' | 'fullHeal' | 'groupHeal' | 'haste' | 'blink' | 'invincible' | 'scatter' | 'weaken' | 'armorUp' | 'seal' | 'agiSteal' | 'absorb' | 'split'

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
  /** 높은 능력치 (그림의 소품도 이걸로 정함: 체력 = 배낭, 방어 = 갑옷, 민첩 = 깃털 모자, 속도 = 운동화) */
  traits: MonsterTrait[]
  color: string
  size: number
}

/**
 * 기본 능력치 (*임시*, 2026-11-27). 체력은 종류끼리의 비율이고 실제 체력은 탄별 배율(stageHpBp)을 곱함.
 * - 한 가지만 높으면 크게, 두 가지면 둘 다 중간쯤 높게
 * - 빠르거나 민첩한 종류는 체력이 낮고, 체력·방어가 높은 종류는 느림 (서로 대가)
 */
export const MONSTER_BASES: Readonly<Record<MonsterId, MonsterBase>> = {
  normal: { id: 'normal', name: '보통', hp: 60, armor: 2, agility: 5, speed: 1000, leak: 1, traits: [], color: '#7cb342', size: 0.22 },
  hp: { id: 'hp', name: '튼튼이', hp: 140, armor: 2, agility: 5, speed: 850, leak: 1, traits: ['hp'], color: '#a1887f', size: 0.27 },
  armor: { id: 'armor', name: '단단이', hp: 70, armor: 7, agility: 4, speed: 850, leak: 1, traits: ['armor'], color: '#90a4ae', size: 0.24 },
  agi: { id: 'agi', name: '날렵이', hp: 50, armor: 2, agility: 10, speed: 1000, leak: 1, traits: ['agi'], color: '#4db6ac', size: 0.21 },
  spd: { id: 'spd', name: '날쌘돌이', hp: 40, armor: 1, agility: 6, speed: 1800, leak: 1, traits: ['spd'], color: '#ffd54f', size: 0.19 },
  hp_armor: { id: 'hp_armor', name: '철벽이', hp: 110, armor: 5, agility: 4, speed: 750, leak: 2, traits: ['hp', 'armor'], color: '#78909c', size: 0.28 },
  hp_agi: { id: 'hp_agi', name: '끈질이', hp: 95, armor: 2, agility: 8, speed: 900, leak: 1, traits: ['hp', 'agi'], color: '#81c784', size: 0.25 },
  hp_spd: { id: 'hp_spd', name: '돌진이', hp: 80, armor: 1, agility: 5, speed: 1400, leak: 1, traits: ['hp', 'spd'], color: '#ff8a65', size: 0.24 },
  armor_agi: { id: 'armor_agi', name: '방패꾼', hp: 60, armor: 5, agility: 8, speed: 900, leak: 1, traits: ['armor', 'agi'], color: '#9575cd', size: 0.23 },
  armor_spd: { id: 'armor_spd', name: '기사', hp: 50, armor: 5, agility: 5, speed: 1400, leak: 1, traits: ['armor', 'spd'], color: '#64b5f6', size: 0.22 },
  agi_spd: { id: 'agi_spd', name: '바람이', hp: 40, armor: 1, agility: 8, speed: 1500, leak: 1, traits: ['agi', 'spd'], color: '#f06292', size: 0.19 },
  boss: { id: 'boss', name: '우두머리', hp: 700, armor: 5, agility: 6, speed: 700, leak: 5, traits: [], color: '#e53935', size: 0.36 },
}

/** 보스에 섞이는 특성 하나당 올라가는 양 (*임시*) */
export const BOSS_TRAIT_BONUS = { hpBp: 14_000, armor: 3, agility: 3, speedBp: 13_000 } as const

/**
 * 종류가 처음 나오는 탄 (*임시*). 보통 → 한 가지 높은 4종 → 20탄부터 두 가지 높은 6종
 * 처음 나오는 탄엔 그 종류가 꼭 섞임 (새 몬스터 소개)
 */
export const MONSTER_UNLOCK: readonly [MonsterId, number][] = [
  ['normal', 1],
  ['spd', 3],
  ['armor', 6],
  ['hp', 9],
  ['agi', 12],
  ['hp_armor', 20],
  ['armor_spd', 24],
  ['hp_spd', 28],
  ['agi_spd', 32],
  ['armor_agi', 36],
  ['hp_agi', 40],
]

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
  // 10. 20% 확률로 때린 캐릭 3초 봉인(특수능력 발동 안 됨 · 강화 효과도 꺼짐) / 쿨 10초 (2026-11-27)
  seal: { name: '봉인', icon: '⛓', chanceBp: 2000, cooldownMs: 10_000, durationMs: 3000, uses: 0 },
  // 11. 때린 캐릭 민첩을 3초간 1로 만들고 뺏은 만큼 자기 민첩에 더함 / 쿨 10초 (2026-11-28, spec 20% → 추천대로 10%, 민첩으로 피함)
  agiSteal: { name: '민첩 빼앗기', icon: '⇄', chanceBp: 1000, cooldownMs: 10_000, durationMs: 3000, uses: 0 },
  // 12. 1초 동안 받는 피해를 모두 체력으로 (최대 체력까지) / 쿨 10초
  absorb: { name: '흡수', icon: '◎', chanceBp: 1000, cooldownMs: 10_000, durationMs: 1000, uses: 0 },
  // 13. 분열: 현재 체력을 반씩 나눠 두 마리 (나온 쪽은 능력 없음, 왕은 안 가짐) / 마리당 1회
  split: { name: '분열', icon: '◐', chanceBp: 1000, cooldownMs: 0, durationMs: 0, uses: 1 },
}

/** 판정 순서 (한 공격에 여러 능력이 있으면 이 순서로 굴림 → 결정성) */
export const MONSTER_ABILITY_KINDS: readonly MonsterAbilityKind[] = [
  'invincible',
  'absorb',
  'fullHeal',
  'groupHeal',
  'haste',
  'blink',
  'split',
  'freeze',
  'scatter',
  'weaken',
  'seal',
  'agiSteal',
  'armorUp',
]
/** 왕(우두머리)은 갖지 않는 능력 */
export const NOT_FOR_BOSS: readonly MonsterAbilityKind[] = ['split']

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
  /** 높은 능력치 (보스는 탄마다 섞인 것) — 그림의 소품 */
  traits: MonsterTrait[]
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

/**
 * n 탄 체력 배율 (basis point, MONSTER_BASES 기본 체력에 곱함). 표가 없으면(보정 전) 100%
 * 71탄부터: 61~69탄(일반 탄) 평균을 바탕으로 탄마다 +3%. 우두머리 탄(10의 배수)은
 * 70탄의 "일반 탄 대비 비율"을 그대로 씀 (예전엔 70탄 값 하나를 바탕으로 해서, 70탄이 우두머리 탄이라
 * 체력이 낮게 잡혀 71탄부터 너무 쉬웠음 — 2026-11-27 수정)
 */
export function stageHpBp(n: number): number {
  if (n <= REFERENCE_MAX_STAGE || !STAGE_HP_BP.length) return STAGE_HP_BP[Math.min(n, REFERENCE_MAX_STAGE) - 1] ?? 10_000
  const tail = STAGE_HP_BP.slice(REFERENCE_MAX_STAGE - 10, REFERENCE_MAX_STAGE - 1) // 61~69탄
  const normalBase = Math.floor(tail.reduce((s, v) => s + v, 0) / tail.length)
  const bossBase = STAGE_HP_BP[REFERENCE_MAX_STAGE - 1] ?? normalBase // 70탄 (우두머리 탄)
  let bp = n % 10 === 0 ? bossBase : normalBase
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
      return `맞으면 ${pct} 확률로 판 위 슬라임 전체가 최대 체력의 ${GROUP_HEAL_BP / 100}% 회복${tail}`
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
    case 'seal':
      return `맞으면 ${pct} 확률로 때린 캐릭의 특수능력을 ${sec(d.durationMs)} 동안 봉인 (강화 효과도 꺼짐)${tail}${dodge}`
    case 'agiSteal':
      return `맞으면 ${pct} 확률로 때린 캐릭의 민첩을 ${sec(d.durationMs)} 동안 1로 만들고 뺏은 만큼 자기 민첩에 더함${tail}${dodge}`
    case 'absorb':
      return `맞으면 ${pct} 확률로 ${sec(d.durationMs)} 동안 받는 피해를 모두 체력으로 회복 (최대 체력까지)${tail}`
    case 'split':
      return `맞으면 ${pct} 확률로 분열: 지금 체력을 반씩 나눠 두 마리가 됨 (나온 쪽은 능력 없음)${tail}`
  }
}

/** n 탄 구성 */
export function stageDef(n: number): StageDef {
  return stageDefWithHp(n, stageHpBp(n))
}

/** 맵 하나가 몇 탄씩 쓰이나 (알파벳 26개 × 4 = 104탄) */
export const STAGES_PER_MAP = 4

/** 난이도 순서의 맵 목록 (순서 파일에 없는 맵은 뒤에 붙임) */
export function orderedMapIds(): string[] {
  const ids = MAP_DEFS.map((d) => d.id)
  const ordered = MAP_ORDER.filter((id) => ids.includes(id))
  return [...ordered, ...ids.filter((id) => !ordered.includes(id))]
}

/** n탄의 맵 */
export function stageMapId(n: number): string {
  const ids = orderedMapIds()
  return ids[Math.floor((n - 1) / STAGES_PER_MAP) % ids.length]!
}

/** 체력 배율을 직접 주는 n 탄 구성 (보정 스크립트용) */
export function stageDefWithHp(n: number, hpBp: number): StageDef {
  if (!Number.isInteger(n) || n < 1) throw new Error(`잘못된 탄: ${n}`)
  const seed = seedFromString(`stage-${n}`)
  const rng = new Rng({ s: seed })
  // 맵: 쉬운 맵 → 어려운 맵 순서(mapOrder.ts, npm run rank-maps)로 STAGES_PER_MAP 탄씩, 104탄 뒤엔 처음부터 다시
  const mapId = stageMapId(n)
  const isBoss = n % 10 === 0

  const armorAdd = Math.floor(n / 10)
  const speedMulBp = Math.min(14_000, 10_000 + n * 40)

  // 몬스터 능력 (탄마다 어느 종류가 무엇을 갖는지 바뀜)
  //   1~9탄: 우두머리만 / 10~29탄: 한 종류만 1개 / 30~49탄: 두 종류가 1개씩
  //   50~69탄: 모든 종류가 1개씩 / 70탄부터: 모든 종류가 2개씩 (*임시*, 예전엔 '전부')
  const abilityPool: readonly MonsterAbilityKind[] = MONSTER_ABILITY_KINDS
  // 나올 종류: 열린 종류 중 최대 (2 + n/20)종. 이 탄에 처음 열린 종류는 꼭, 나머지는 무작위
  const unlocked = MONSTER_UNLOCK.filter(([, at]) => n >= at).map(([id]) => id)
  const debut = MONSTER_UNLOCK.find(([, at]) => at === n)?.[0]
  const kinds = Math.min(unlocked.length, 2 + Math.floor(n / 20))
  const rest = unlocked.filter((t) => t !== debut)
  const types: MonsterId[] = debut ? [debut] : []
  while (types.length < kinds && rest.length) types.push(rest.splice(rng.int(rest.length), 1)[0]!)
  types.sort((a, b) => unlocked.indexOf(a) - unlocked.indexOf(b))
  // 보스: 특성 3개 이상 섞음 (50탄부터 4개 전부)
  const bossTraits: MonsterTrait[] = []
  if (isBoss) {
    const pool = [...MONSTER_TRAITS]
    const k = n >= 50 ? 4 : 3
    while (bossTraits.length < k) bossTraits.push(pool.splice(rng.int(pool.length), 1)[0]!)
    bossTraits.sort((a, b) => MONSTER_TRAITS.indexOf(a) - MONSTER_TRAITS.indexOf(b))
    types.push('boss')
  }
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
    const pool = abilityPool.filter((a) => t !== 'boss' || !NOT_FOR_BOSS.includes(a))
    const picked: MonsterAbilityKind[] = []
    for (let k = 0; k < (n >= 70 ? 2 : 1); k++) picked.push(pool.splice(rng.int(pool.length), 1)[0]!)
    return abilityPool.filter((a) => picked.includes(a))
  }

  const monsters: StageDef['monsters'] = {}
  for (const t of types) {
    const b = MONSTER_BASES[t]
    const bt = t === 'boss' ? bossTraits : []
    const has = (k: MonsterTrait) => bt.includes(k)
    const baseHp = has('hp') ? Math.floor((b.hp * BOSS_TRAIT_BONUS.hpBp) / 10_000) : b.hp
    const baseSpeed = has('spd') ? Math.floor((b.speed * BOSS_TRAIT_BONUS.speedBp) / 10_000) : b.speed
    monsters[t] = {
      id: t,
      name: t === 'boss' ? `우두머리 (${bt.map((k) => TRAIT_NAMES[k]).join('·')})` : b.name,
      hp: Math.max(1, Math.floor((baseHp * hpBp) / 10_000)),
      armor: b.armor + (has('armor') ? BOSS_TRAIT_BONUS.armor : 0) + armorAdd,
      // 민첩: 25탄마다 +1 (임시)
      agility: b.agility + (has('agi') ? BOSS_TRAIT_BONUS.agility : 0) + Math.floor(n / 25),
      speed: Math.floor((baseSpeed * speedMulBp) / 10_000),
      traits: t === 'boss' ? bt : [...b.traits],
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
  // 일반 종류끼리 마릿수를 고르게 나눔 (남는 건 앞 종류부터 +1). 종류마다 2초씩 엇갈려 출발
  const normals = types.filter((t) => t !== 'boss')
  normals.forEach((t, i) => {
    const c = Math.floor(count / normals.length) + (i < count % normals.length ? 1 : 0)
    if (c > 0) groups.push({ monster: t, count: c, delayMs: i * 2000, intervalMs: Math.floor(interval * normals.length * (MONSTER_BASES[t].speed >= 1400 ? 0.8 : 1)) })
  })
  if (isBoss) groups.push({ monster: 'boss', count: n >= 50 ? 2 : 1, delayMs: Math.floor((count * interval) / 2), intervalMs: 4000 })

  return { stage: n, mapId, seed, monsters, groups, isBoss }
}

/** 탄 정보 화면용: 종류별 마릿수 */
export function stageSummary(s: StageDef): { spec: MonsterSpec; count: number }[] {
  const by = new Map<MonsterId, number>()
  for (const g of s.groups) by.set(g.monster, (by.get(g.monster) ?? 0) + g.count)
  return [...by].map(([id, count]) => ({ spec: s.monsters[id]!, count }))
}
