import { describe, expect, it } from 'vitest'
import { createRngState, drawUnit, makeConfig, mergeReward, rerollAbility, rerollStats, Rng, type UnitInstance } from '../src/index.ts'

const cfg = makeConfig({})
const base: UnitInstance = { id: 'u1', image: 'img1', atk: 10, range: 1, attackSpeed: 1, agility: 5, ability: null }

describe('막사', () => {
  it('뽑기: 능력치가 범위 안, 같은 씨앗이면 같은 캐릭', () => {
    const a = drawUnit(cfg, new Rng(createRngState('x')), 'u9')
    const b = drawUnit(cfg, new Rng(createRngState('x')), 'u9')
    expect(a).toEqual(b)
    expect(a.atk).toBeGreaterThanOrEqual(cfg.atk.min)
    expect(a.atk).toBeLessThanOrEqual(cfg.atk.max)
    expect(a.id).toBe('u9')
  })

  it('능력치 변경: 고른 능력치는 그대로, 특수능력은 없어지지 않음', () => {
    const rng = new Rng(createRngState('s'))
    const withAb: UnitInstance = { ...base, ability: { kind: 'crit', chanceBp: 500 } }
    for (let i = 0; i < 200; i++) {
      const r = rerollStats(cfg, rng, withAb, ['atk', 'agility'])
      expect([r.atk, r.agility]).toEqual([10, 5])
      expect(r.ability).toEqual(withAb.ability)
      expect(r.id).toBe('u1')
    }
  })

  it('능력치 변경: 특수능력 없는 캐릭은 약 5% 로 특수능력이 생김', () => {
    const rng = new Rng(createRngState('g'))
    let got = 0
    const n = 20000
    for (let i = 0; i < n; i++) if (rerollStats(cfg, rng, base, []).ability) got++
    expect(got / n).toBeGreaterThan(0.04)
    expect(got / n).toBeLessThan(0.06)
  })

  it('특수능력 변경: 없는 캐릭엔 못 씀', () => {
    const rng = new Rng(createRngState('a'))
    expect(rerollAbility(rng, base)).toBeNull()
    expect(rerollAbility(rng, { ...base, ability: { kind: 'crit', chanceBp: 500 } })?.ability).not.toBeNull()
  })

  it('합성: 정해진 수만, 3명은 1% 최상급 · 5% 상급 · 나머지 보통', () => {
    const rng = new Rng(createRngState('m'))
    expect([4, 6, 7, 9, 11, 13].map((k) => mergeReward(rng, k))).toEqual([null, null, null, null, null, null])
    expect([5, 8, 10, 12].map((k) => mergeReward(rng, k))).toEqual(['draw', 'statHigh', 'ability', 'statTop'])
    const c = { statNormal: 0, statHigh: 0, statTop: 0 } as Record<string, number>
    const n = 50000
    for (let i = 0; i < n; i++) c[mergeReward(rng, 3)!]!++
    expect(c.statTop! / n).toBeCloseTo(0.01, 2)
    expect(c.statHigh! / n).toBeCloseTo(0.05, 1)
  })
})
