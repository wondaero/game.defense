/**
 * 캐릭 특수능력 (사용자 작성 docs/spec, 2026-11-26).
 * - 캐릭당 0~1개. 붙을 확률은 설정 abilityChanceBp, 붙으면 11종 균등 (2026-11-27 맹독·전체 강화·광폭화·호크아이 추가, 수치 강화)
 * - 전체 강화는 발동하는 능력이 아니라 자기 공격력·공속·민첩을 한꺼번에 × 1.1/1.2/1.3 (최대를 넘을 수 있음, roster.ts baseStats)
 * - 모두 **공격할 때 발동, 빗나가도 발동**
 * - 능력마다 뽑는 수치는 최대 2개 (확률 + 시간 / 확률만 / 능력치 종류 + 레벨 등)
 * - 쿨타임은 능력 종류마다 고정 (뽑기 아님)
 *
 * 수치 단위: *Bp 는 basis point (5% = 500), *Ms 는 밀리초
 */
import { Rng } from './rng.ts'

export type AbilityKind = 'stun' | 'splash' | 'crit' | 'obstacle' | 'recall' | 'teamLevel' | 'allAttack' | 'poison' | 'boostAll' | 'frenzy' | 'hawkeye' | 'hypnosis'
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
  /** 전체 강화: 자기 공격력·공속·민첩을 모두 × mulBp (11000 = 1.1배). 발동 없음 (chanceBp 0) — 2026-11-27 닌자·장군 대신 */
  | { kind: 'boostAll'; chanceBp: 0; mulBp: number }
  /** 광폭화: 발동하면 FRENZY_MS 동안 공속 2배 · 민첩 2배. 확률(5/10%)과 쿨타임(5/8초)을 따로 뽑음 */
  | { kind: 'frenzy'; chanceBp: number; cooldownMs: number }
  /** 호크아이: 원래 사거리 + plus (1/2/3), 항상. 발동 없음 (chanceBp 0) */
  | { kind: 'hawkeye'; chanceBp: 0; plus: number }
  /** 최면: 때린 몬스터가 HYPNOSIS_CELLS 칸 뒤로 걸어갔다가 다시 옴. 몬스터당 한 번 (2026-11-27 spec 12) */
  | { kind: 'hypnosis'; chanceBp: number }

export const ABILITY_KINDS: readonly AbilityKind[] = ['stun', 'splash', 'crit', 'obstacle', 'recall', 'teamLevel', 'allAttack', 'poison', 'boostAll', 'frenzy', 'hawkeye', 'hypnosis']

export const ABILITY_NAMES: Readonly<Record<AbilityKind, string>> = {
  stun: '스턴',
  splash: '광역공격',
  crit: '2배 데미지',
  obstacle: '장애물 추가',
  recall: '출발지로 보내기',
  teamLevel: '아군 전체 레벨업',
  allAttack: '전체 공격',
  poison: '맹독',
  boostAll: '전체 강화',
  frenzy: '광폭화',
  hawkeye: '호크아이',
  hypnosis: '최면',
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
  boostAll: 0,
  frenzy: 0, // 개체마다 다름 (Ability.cooldownMs)
  hawkeye: 0,
  hypnosis: 0,
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
  boost: { mulBp: [11_000, 12_000, 13_000] },
  /** 확률·쿨타임 따로 뽑음 (spec: 5/10% · 쿨 5/8초) */
  frenzy: { chanceBp: [500, 1000], cooldownMs: [5000, 8000] },
  hawkeye: { plus: [1, 2, 3] },
  hypnosis: { chanceBp: [500, 1000] },
} as const

/** 광역공격 범위: 맞힌 자리 중심 (2 × 반경 + 1) 칸 정사각형 = 5×5 */
export const SPLASH_RADIUS = 2

// ── 추천값으로 임시 적용 (사용자 확인 전) ──
/** 스턴이 풀린 몬스터는 이 시간 동안 다시 안 걸림 (스턴 캐릭이 모여도 계속 멈추지 않게) */
export const STUN_IMMUNE_MS = 1000
/** 광폭화 지속 시간 */
export const FRENZY_MS = 2000
/** 최면: 뒤로 가는 칸 수 */
export const HYPNOSIS_CELLS = 5
/**
 * 특수능력 저항 (2026-11-27): 몬스터에게 거는 능력(스턴·출발지로 보내기·최면·맹독)은 발동한 뒤
 * 한 번 더 굴림 — 걸릴 확률 = RESIST_POWER / (RESIST_POWER + 몬스터 민첩). 예) 민첩 10 → 20/30 = 2/3.
 * 왕(우두머리)도 똑같이 걸릴 수 있음 (민첩이 높아 덜 걸림). *임시* 20 (사용자: 30 도 괜찮음)
 */
export const RESIST_POWER = 20
/** 저항 판정을 하는 능력 */
export const RESISTABLE: readonly AbilityKind[] = ['stun', 'recall', 'hypnosis', 'poison']
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
    case 'boostAll':
      return { kind, chanceBp: 0, mulBp: pick(rng, t.boost.mulBp) }
    case 'frenzy':
      return { kind, chanceBp: pick(rng, t.frenzy.chanceBp), cooldownMs: pick(rng, t.frenzy.cooldownMs) }
    case 'hawkeye':
      return { kind, chanceBp: 0, plus: pick(rng, t.hawkeye.plus) }
    case 'hypnosis':
      return { kind, chanceBp: pick(rng, t.hypnosis.chanceBp) }
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
        a.obstacle === 'damage' ? `가시 장애물 (몬스터가 처음 밟을 때 최대 체력의 ${pct(a.amountBp)}, 마리마다 한 번)` : `늪 장애물 (밟으면 속도 −${pct(a.amountBp)})`
      } · 판당 1회`
    case 'recall':
      return `${pct(a.chanceBp)} 확률로 때린 몬스터를 출발지로${tail}`
    case 'teamLevel':
      return `${pct(a.chanceBp)} 확률로 아군 전체 레벨 +${a.level}: ${levelText(a.stat, a.level)} (${sec(TEAM_LEVEL_MS)})${tail}`
    case 'allAttack':
      return `${pct(a.chanceBp)} 확률로 맵에 있는 몬스터 전체 공격 (공격력 − 방어력)${tail}`
    case 'poison':
      return `${pct(a.chanceBp)} 확률로 맹독: 죽을 때까지 1초마다 공격력의 ${pct(a.pctBp)} (방어 무시, 몬스터당 한 번)`
    case 'boostAll':
      return `공격력·공속·민첩 모두 × ${a.mulBp / 10000} (최대를 넘을 수 있음, 사거리 제외, 봉인되면 원래 값)`
    case 'frenzy':
      return `${pct(a.chanceBp)} 확률로 ${sec(FRENZY_MS)} 동안 공속 2배 · 민첩 2배 (쿨타임 ${sec(a.cooldownMs)})`
    case 'hawkeye':
      return `사거리 +${a.plus} (항상, 봉인되면 원래 사거리)`
    case 'hypnosis':
      return `${pct(a.chanceBp)} 확률로 최면: 때린 몬스터가 ${HYPNOSIS_CELLS}칸 뒤로 갔다가 다시 옴 (몬스터당 한 번)`
  }
}
