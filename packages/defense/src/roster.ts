import { rollAbility, type Ability } from './abilities.ts'
import type { DefenseConfig } from './config.ts'
import { Rng, type RngState } from './rng.ts'

/** 기본 능력치 4개(공격력·사거리·공격 간격·민첩)는 각각 따로 뽑는다 (2026-11-26) */

/** 그림 8종 (성능 무관). 같은 그림은 한 판에 한 명만 */
export const IMAGES = ['img1', 'img2', 'img3', 'img4', 'img5', 'img6', 'img7', 'img8'] as const

export interface UnitInstance {
  id: string
  image: string
  atk: number
  range: number
  /** 공격 간격 (밀리초). 작을수록 빠름 */
  interval: number
  /** 민첩 (명중 + 몬스터 기술 회피) */
  agility: number
  /** 특수능력 0~1개 */
  ability: Ability | null
}

export function rollUnit(cfg: DefenseConfig, rng: Rng, id: string, image: string): UnitInstance {
  const atk = rng.range(cfg.atk.min, cfg.atk.max)
  const range = rng.range(cfg.range.min, cfg.range.max)
  const step = Math.max(1, cfg.attackIntervalStep)
  const interval = cfg.attackInterval.min + step * rng.range(0, Math.floor((cfg.attackInterval.max - cfg.attackInterval.min) / step))
  const agility = rng.range(cfg.agility.min, cfg.agility.max)
  const ability = rng.int(10_000) < cfg.abilityChanceBp ? rollAbility(rng) : null
  return { id, image, atk, range, interval, agility, ability }
}

/** 시험판용 보관함: 그림이 겹치지 않게 rosterSize 명 */
export function rollRoster(cfg: DefenseConfig, rngState: RngState): { units: UnitInstance[]; rng: RngState } {
  const rng = new Rng(rngState)
  const pool: string[] = [...IMAGES]
  const units: UnitInstance[] = []
  const n = Math.min(cfg.rosterSize, pool.length)
  for (let i = 0; i < n; i++) {
    const image = pool.splice(rng.int(pool.length), 1)[0]!
    units.push(rollUnit(cfg, rng, `u${i + 1}`, image))
  }
  return { units, rng: rng.state() }
}
