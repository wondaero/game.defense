/**
 * 캐릭 특수능력 (사용자 작성 docs/spec, 2026-11-26).
 * - 캐릭당 0~1개. 붙을 확률은 설정 abilityChanceBp, 붙으면 8종 균등 (2026-11-27 맹독 추가, 수치 강화)
 * - 모두 **공격할 때 발동, 빗나가도 발동**
 * - 능력마다 뽑는 수치는 최대 2개 (확률 + 시간 / 확률만 / 능력치 종류 + 레벨 등)
 * - 쿨타임은 능력 종류마다 고정 (뽑기 아님)
 *
 * 수치 단위: *Bp 는 basis point (5% = 500), *Ms 는 밀리초
 */
import { Rng } from './rng.ts'

export type AbilityKind = 'stun' | 'splash' | 'crit' | 'obstacle' | 'recall' | 'teamLevel' | 'allAttack' | 'poison'
export type BuffStat = 'atk' | 'range' | 'speed' | 'agility' | 'all'
export type ObstacleKind = 'damage' | 'slow'

export type Ability =
  | { kind: 'stun'; chanceBp: number; durationMs: number }
  | { kind: 'splash'; chanceBp: number }
  | { kind: 'crit'; chanceBp: number }
  /** amountBp: 가시 = 1초마다 몬스터 최대 체력의 %, 늪 = 속도 감소 % */
  | { kind: 'obstacle'; chanceBp: number; obstacle: ObstacleKind; amountBp: number }
  | { kind: 'recall'; chanceBp: number }
  | { kind: 'teamLevel'; chanceBp: number; stat: BuffStat; level: number }
  | { kind: 'allAttack'; chanceBp: number }
  /** pctBp: 1초마다 공격력의 % (몬스터당 한 번, 중첩 없음, 죽을 때까지) */
  | { kind: 'poison'; chanceBp: number; pctBp: number }

export const ABILITY_KINDS: readonly AbilityKind[] = ['stun', 'splash', 'crit', 'obstacle', 'recall', 'teamLevel', 'allAttack', 'poison']

export const ABILITY_NAMES: Readonly<Record<AbilityKind, string>> = {
  stun: '스턴',
  splash: '광역공격',
  crit: '2배 데미지',
  obstacle: '장애물 추가',
  recall: '출발지로 보내기',
  teamLevel: '아군 전체 레벨업',
  allAttack: '전체 공격',
  poison: '맹독',
}

/** 쿨타임 (0 = 없음). 장애물은 판당 1회라 따로 */
export const ABILITY_COOLDOWN_MS: Readonly<Record<AbilityKind, number>> = {
  stun: 3000,
  splash: 0,
  crit: 0,
  obstacle: 0,
  recall: 20_000,
  teamLevel: 20_000,
  allAttack: 1000,
  poison: 0,
}

/** 뽑기 표 (docs/spec 그대로) */
export const ROLL_TABLE = {
  stun: { chanceBp: [500, 1000, 1500], durationMs: [500, 1000, 1500] },
  splash: { chanceBp: [300, 500] },
  crit: { chanceBp: [500, 1000] },
  obstacle: { chanceBp: [500, 1000], obstacle: ['damage', 'slow'] as ObstacleKind[], damageBp: [1000, 2000], slowBp: [4000, 5000, 6000] },
  recall: { chanceBp: [300, 500] },
  teamLevel: { chanceBp: [500], stat: ['atk', 'range', 'speed', 'agility', 'all'] as BuffStat[], level: [1, 2, 3] },
  allAttack: { chanceBp: [200, 300, 400, 500] },
  poison: { chanceBp: [500, 1000], pctBp: [2000, 3000, 4000] },
} as const

/** 광역공격 범위: 맞힌 자리 중심 (2 × 반경 + 1) 칸 정사각형 = 5×5 */
export const SPLASH_RADIUS = 2

// ── 추천값으로 임시 적용 (사용자 확인 전) ──
/** 스턴이 풀린 몬스터는 이 시간 동안 다시 안 걸림 (스턴 캐릭이 모여도 계속 멈추지 않게) */
export const STUN_IMMUNE_MS = 1000
/** 아군 전체 레벨업 지속 시간 */
export const TEAM_LEVEL_MS = 5000

/** 레벨업 1~3단계가 능력치별로 실제 얼마인지 */
export function levelBonus(stat: Exclude<BuffStat, 'all'>, level: number): number {
  switch (stat) {
    case 'atk':
      return 2 * level
    case 'range':
      return level >= 3 ? 2 : 1
    case 'speed':
      return level // 공속 +1씩 (뽑기 최대 5 → 레벨업으로 최대 8)
    case 'agility':
      return level // 민첩 최대 10 → 레벨업으로 11~13
  }
}

const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[rng.int(xs.length)]!

export function rollAbility(rng: Rng): Ability {
  const kind = pick(rng, ABILITY_KINDS)
  const t = ROLL_TABLE
  switch (kind) {
    case 'stun':
      return { kind, chanceBp: pick(rng, t.stun.chanceBp), durationMs: pick(rng, t.stun.durationMs) }
    case 'splash':
      return { kind, chanceBp: pick(rng, t.splash.chanceBp) }
    case 'crit':
      return { kind, chanceBp: pick(rng, t.crit.chanceBp) }
    case 'obstacle': {
      const chanceBp = pick(rng, t.obstacle.chanceBp)
      const obstacle = pick(rng, t.obstacle.obstacle)
      return { kind, chanceBp, obstacle, amountBp: pick(rng, obstacle === 'damage' ? t.obstacle.damageBp : t.obstacle.slowBp) }
    }
    case 'recall':
      return { kind, chanceBp: pick(rng, t.recall.chanceBp) }
    case 'teamLevel':
      return { kind, chanceBp: pick(rng, t.teamLevel.chanceBp), stat: pick(rng, t.teamLevel.stat), level: pick(rng, t.teamLevel.level) }
    case 'allAttack':
      return { kind, chanceBp: pick(rng, t.allAttack.chanceBp) }
    case 'poison':
      return { kind, chanceBp: pick(rng, t.poison.chanceBp), pctBp: pick(rng, t.poison.pctBp) }
  }
}

const pct = (bp: number) => `${bp / 100}%`
const sec = (ms: number) => `${ms / 1000}초`
export const STAT_NAMES: Readonly<Record<BuffStat, string>> = { atk: '공격력', range: '사거리', speed: '공속', agility: '민첩', all: '전체' }

function levelText(stat: BuffStat, level: number): string {
  const one = (s: Exclude<BuffStat, 'all'>) => {
    const v = levelBonus(s, level)
    return `${STAT_NAMES[s]} +${v}`
  }
  return stat === 'all' ? (['atk', 'range', 'speed', 'agility'] as const).map(one).join(', ') : one(stat)
}

export function abilityDesc(a: Ability): string {
  const cd = ABILITY_COOLDOWN_MS[a.kind]
  const tail = cd ? ` (쿨타임 ${sec(cd)})` : ''
  switch (a.kind) {
    case 'stun':
      return `${pct(a.chanceBp)} 확률로 ${sec(a.durationMs)} 스턴${tail}`
    case 'splash':
      return `${pct(a.chanceBp)} 확률로 맞힌 자리 중심 ${SPLASH_RADIUS * 2 + 1}×${SPLASH_RADIUS * 2 + 1} 광역공격`
    case 'crit':
      return `${pct(a.chanceBp)} 확률로 2배 데미지 (공격력×2 − 방어력)`
    case 'obstacle':
      return `${pct(a.chanceBp)} 확률로 길 무작위 칸에 ${
        a.obstacle === 'damage' ? `가시 장애물 (밟으면 1초마다 몬스터 최대 체력의 ${pct(a.amountBp)})` : `늪 장애물 (밟으면 속도 −${pct(a.amountBp)})`
      } · 판당 1회`
    case 'recall':
      return `${pct(a.chanceBp)} 확률로 때린 몬스터를 출발지로${tail}`
    case 'teamLevel':
      return `${pct(a.chanceBp)} 확률로 아군 전체 레벨 +${a.level}: ${levelText(a.stat, a.level)} (${sec(TEAM_LEVEL_MS)})${tail}`
    case 'allAttack':
      return `${pct(a.chanceBp)} 확률로 맵에 있는 몬스터 전체 공격 (공격력 − 방어력)${tail}`
    case 'poison':
      return `${pct(a.chanceBp)} 확률로 맹독: 죽을 때까지 1초마다 공격력의 ${pct(a.pctBp)} (방어 무시, 몬스터당 한 번)`
  }
}
