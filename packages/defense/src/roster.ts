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
export function statScore(cfg: DefenseConfig, u: Pick<UnitInstance, 'atk' | 'range' | 'attackSpeed' | 'agility'>): number {
  const part = (v: number, r: { min: number; max: number }) => (r.max > r.min ? (Math.min(Math.max(v, r.min), r.max) - r.min) / (r.max - r.min) : 1) * 25
  return Math.round(part(u.atk, cfg.atk) + part(u.range, cfg.range) + part(u.attackSpeed, cfg.attackSpeed) + part(u.agility, cfg.agility))
}

/**
 * 능력치 등급 = 헬멧 색. 기본 범위에서 뽑으면 대략 회색 22% · 초록 27% · 파랑 23% · 보라 17% · 주황 8.5% · 금 2.4%
 */
export const STAT_TIERS = [
  { tier: 1, min: 0, name: '회색', color: '#9e9e9e' },
  { tier: 2, min: 35, name: '초록', color: '#43a047' },
  { tier: 3, min: 50, name: '파랑', color: '#1e88e5' },
  { tier: 4, min: 62, name: '보라', color: '#8e24aa' },
  { tier: 5, min: 75, name: '주황', color: '#fb8c00' },
  { tier: 6, min: 88, name: '금', color: '#fdd835' },
] as const

export function statTier(cfg: DefenseConfig, u: Pick<UnitInstance, 'atk' | 'range' | 'attackSpeed' | 'agility'>) {
  const s = statScore(cfg, u)
  let t: (typeof STAT_TIERS)[number] = STAT_TIERS[0]
  for (const x of STAT_TIERS) if (s >= x.min) t = x
  return { ...t, score: s }
}
