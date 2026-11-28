import { rollAbility, type Ability } from './abilities.ts'
import type { DefenseConfig } from './config.ts'
import { Rng, type RngState } from './rng.ts'

/** 기본 능력치 4개(공격력·사거리·공격 간격·민첩)는 각각 따로 뽑는다 (2026-11-26) */

/** 그림 8종 (성능 무관). 같은 그림·같은 특수능력이어도 여러 명 출전 가능 (2026-11-26) */
export const IMAGES = ['img1', 'img2', 'img3', 'img4', 'img5', 'img6', 'img7', 'img8'] as const

export interface UnitInstance {
  id: string
  image: string
  atk: number
  range: number
  /** 공속 1~5: 1초에 이만큼 공격 */
  attackSpeed: number
  /** 민첩 (명중 + 몬스터 기술 회피) */
  agility: number
  /** 특수능력 0~1개 */
  ability: Ability | null
}

export function rollUnit(cfg: DefenseConfig, rng: Rng, id: string, image: string): UnitInstance {
  const atk = rng.range(cfg.atk.min, cfg.atk.max)
  const range = rng.range(cfg.range.min, cfg.range.max)
  const attackSpeed = rng.range(cfg.attackSpeed.min, cfg.attackSpeed.max)
  const agility = rng.range(cfg.agility.min, cfg.agility.max)
  const ability = rng.int(10_000) < cfg.abilityChanceBp ? rollAbility(rng) : null
  return { id, image, atk, range, attackSpeed, agility, ability }
}

/** 시험판용 보관함: rosterSize 명. 그림은 8종을 한 바퀴씩 섞어 돌려 씀 (겹쳐도 됨) */
export function rollRoster(cfg: DefenseConfig, rngState: RngState): { units: UnitInstance[]; rng: RngState } {
  const rng = new Rng(rngState)
  let pool: string[] = []
  const units: UnitInstance[] = []
  for (let i = 0; i < cfg.rosterSize; i++) {
    if (!pool.length) pool = [...IMAGES]
    const image = pool.splice(rng.int(pool.length), 1)[0]!
    units.push(rollUnit(cfg, rng, `u${i + 1}`, image))
  }
  return { units, rng: rng.state() }
}

/**
 * 능력치 점수 0~100 (2026-11-27): 공격력·사거리·공속·민첩을 각각 범위 안에서 0~25점으로 바꿔 더함.
 * 캐릭 헬멧 색 = 이 점수의 등급. 특수능력은 점수에 안 들어감 (손에 든 도구로 따로 표시)
 */
/**
 * 실제로 쓰는 기본 능력치 (2026-11-27): 전체 강화 특수능력이 있으면 공격력·공속·민첩 모두 × 1.1/1.2/1.3 (최대를 넘을 수 있음, 사거리는 1~2칸이라 그대로).
 * 공격력은 내림(정수), 공속·민첩은 소수 첫째 자리까지. sealed(몬스터 "봉인") 중엔 원래 뽑힌 값
 */
export function baseStats(cfg: DefenseConfig, u: Pick<UnitInstance, 'atk' | 'range' | 'attackSpeed' | 'agility' | 'ability'>, sealed = false) {
  let { atk, range, attackSpeed, agility } = u
  const a = sealed ? null : u.ability
  if (a && a.kind === 'boostAll') {
    const tenth = (v: number) => Math.round((v * a.mulBp) / 1000) / 10
    atk = Math.floor((atk * a.mulBp) / 10_000)
    attackSpeed = tenth(attackSpeed)
    agility = tenth(agility)
  }
  // 호크아이: 원래 사거리 + 1/2/3 (2026-11-27)
  if (a && a.kind === 'hawkeye') range += a.plus
  void cfg
  return { atk, range, attackSpeed, agility }
}

export function statScore(cfg: DefenseConfig, unit: Pick<UnitInstance, 'atk' | 'range' | 'attackSpeed' | 'agility'> & { ability?: UnitInstance['ability'] }): number {
  // 원래 뽑은 능력치로 계산 (2026-11-28 사용자 결정): 특수능력(전체 강화·호크아이)이 올린 값은 넣지 않음
  // → 헬멧 색 · 이름(○○ n호 · 총사령관)은 특수능력을 바꿔도 그대로
  const u = baseStats(cfg, { ...unit, ability: null })
  const part = (v: number, r: { min: number; max: number }) => (r.max > r.min ? (Math.min(Math.max(v, r.min), r.max) - r.min) / (r.max - r.min) : 1) * 25
  return Math.round(part(u.atk, cfg.atk) + part(u.range, cfg.range) + part(u.attackSpeed, cfg.attackSpeed) + part(u.agility, cfg.agility))
}

/**
 * 능력치 등급 = 헬멧 색. 기본 범위에서 뽑으면 대략 흰색 22% · 노랑 27% · 초록 23% · 파랑 17% · 보라 8.5% · 무지개 2.4% (2026-11-27 색 바꿈, 기준 점수·확률은 그대로)
 */
export const STAT_TIERS = [
  { tier: 1, min: 0, name: '흰색', color: '#eeeeee' },
  { tier: 2, min: 35, name: '노랑', color: '#fdd835' },
  { tier: 3, min: 50, name: '초록', color: '#43a047' },
  { tier: 4, min: 62, name: '파랑', color: '#1e88e5' },
  { tier: 5, min: 75, name: '보라', color: '#8e24aa' },
  { tier: 6, min: 88, name: '무지개', color: '#e040fb' },
] as const

export function statTier(cfg: DefenseConfig, u: Pick<UnitInstance, 'atk' | 'range' | 'attackSpeed' | 'agility'> & { ability?: UnitInstance['ability'] }) {
  const s = statScore(cfg, u)
  let t: (typeof STAT_TIERS)[number] = STAT_TIERS[0]
  for (const x of STAT_TIERS) if (s >= x.min) t = x
  return { ...t, score: s }
}
