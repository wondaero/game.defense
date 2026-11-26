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
