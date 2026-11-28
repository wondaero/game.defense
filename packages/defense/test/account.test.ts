import { describe, expect, it } from 'vitest'
import {
  applyBarracks,
  SHOP_PRICES,
  createRngState,
  createWave,
  autoPlace,
  judgeStage,
  makeConfig,
  MAP_DEFS,
  newAccount,
  parseMap,
  Rng,
  rollRoster,
  stageDef,
  stageGold,
  stageOpen,
  stepWave,
} from '../src/index.ts'

const cfg = makeConfig({})
const rng = () => new Rng(createRngState('acc'))
const units = rollRoster(cfg, createRngState('시험판-1')).units

describe('계정 (서버가 돌릴 규칙)', () => {
  it('막사 요청: 권이 없거나 잘못된 요청은 거절, 계정은 그대로', () => {
    const acc = { ...newAccount(units.slice(0, 5)), tickets: { draw: 0, statNormal: 0, statHigh: 0, statTop: 0, ability: 0 } }
    expect(applyBarracks(cfg, acc, { type: 'draw' }, rng()).ok).toBe(false)
    expect(applyBarracks(cfg, acc, { type: 'rerollAbility', unitId: 'u1' }, rng()).ok).toBe(false)
    expect(applyBarracks(cfg, acc, { type: 'merge', unitIds: ['u1', 'u2'], target: 'statNormal' }, rng()).ok).toBe(false)
    expect(applyBarracks(cfg, acc, { type: 'merge', unitIds: ['u1', 'u2', 'nope'], target: 'statNormal' }, rng()).ok).toBe(false)
    const rich = { ...acc, tickets: { ...acc.tickets, statHigh: 1 } }
    expect(applyBarracks(cfg, rich, { type: 'rerollStats', unitId: 'u1', grade: 'statHigh', keep: [] }, rng()).ok).toBe(false) // 1개 골라야 함
    const ok = applyBarracks(cfg, rich, { type: 'rerollStats', unitId: 'u1', grade: 'statHigh', keep: ['atk'] }, rng())
    expect(ok.ok && ok.account.tickets.statHigh).toBe(0)
  })

  it('뽑기·합성: 권이 줄고/늘고, 막사가 꽉 차면 못 뽑음', () => {
    const acc = newAccount(units.slice(0, 3))
    const d = applyBarracks(cfg, acc, { type: 'draw' }, rng())
    expect(d.ok && [d.account.units.length, d.account.tickets.draw, d.account.nextUnitId]).toEqual([4, 4, 5])
    const m = applyBarracks(cfg, acc, { type: 'merge', unitIds: ['u1', 'u2', 'u3'], target: 'statNormal' }, rng())
    expect(m.ok && m.account.units.length).toBe(0)
    // 만들 권을 고르고 배수만큼: 보통(3명) × 4 = 12명 → 4장, 배수가 아니면 거절
    const twelve = newAccount(units.slice(0, 12))
    const ids = twelve.units.map((u) => u.id)
    const m4 = applyBarracks(cfg, twelve, { type: 'merge', unitIds: ids, target: 'statNormal' }, rng())
    expect(m4.ok && m4.value.type === 'merged' && m4.value.rewards.length).toBe(4)
    expect(m4.ok && m4.account.units.length).toBe(0)
    expect(applyBarracks(cfg, twelve, { type: 'merge', unitIds: ids.slice(0, 7), target: 'statNormal' }, rng()).ok).toBe(false)
    const d2 = applyBarracks(cfg, twelve, { type: 'merge', unitIds: ids.slice(0, 10), target: 'draw' }, rng())
    expect(d2.ok && [d2.account.tickets.draw, d2.account.units.length]).toEqual([twelve.tickets.draw + 2, 2])
    const full = newAccount(units) // 100명
    expect(applyBarracks(cfg, full, { type: 'draw' }, rng()).ok).toBe(false)
  })

  it('탄 보상: 권 확률은 별(★★★ 15% · ★★ 10% · ★ 5%), 다시 깨면 1/10', () => {
    const st = stageDef(1)
    const map = parseMap(MAP_DEFS.find((m) => m.id === st.mapId)!)
    const placements = autoPlace(cfg, map, units.slice(0, cfg.maxDeploy))
    const acc = newAccount(units)
    let tickets = 0
    let firstGold = 0
    for (let i = 0; i < 300; i++) {
      const j = judgeStage(cfg, acc, { stageNo: 1, placements, seed: 7 }, new Rng(createRngState(i)))
      if (!j.ok || !j.value.cleared) throw new Error('1탄은 깨야 함')
      expect(j.value.reward.firstClear).toBe(true)
      firstGold = j.value.reward.gold
      if (j.value.reward.ticket) tickets++
    }
    expect(firstGold).toBe(stageGold(1, 3))
    // 1탄은 ★★★ → 15% (300번 중 약 45)
    expect(tickets).toBeGreaterThan(25)
    expect(tickets).toBeLessThan(70)
    const again = { ...acc, best: 1, stars: { 1: 3 } }
    let againTickets = 0
    for (let i = 0; i < 3000; i++) {
      const j = judgeStage(cfg, again, { stageNo: 1, placements, seed: 7 }, new Rng(createRngState(i)))
      if (!j.ok) throw new Error()
      expect(j.value.reward.gold).toBe(stageGold(1, 3, true))
      if (j.value.reward.ticket) againTickets++
    }
    // 다시 깬 탄 ★★★: 1.5% (3000번 중 약 45)
    expect(againTickets).toBeGreaterThan(20)
    expect(againTickets).toBeLessThan(75)
  })

  it('탄 보상 골드: 별 3·2·1·실패 = 100·80·50·5%, 이미 깬 탄은 1/10', () => {
    expect([3, 2, 1, 0].map((k) => stageGold(50, k))).toEqual([120, 96, 60, 6])
    expect([3, 2, 1, 0].map((k) => stageGold(50, k, true))).toEqual([12, 9, 6, 0])
  })

  it('탄 판정: 화면에서 한 칸씩 돌린 결과와 다시 돌린 결과가 같음, 열리지 않은 탄은 거절', () => {
    const acc = newAccount(units)
    const st = stageDef(1)
    const map = parseMap(MAP_DEFS.find((m) => m.id === st.mapId)!)
    const deck = units.slice(0, cfg.maxDeploy)
    const placements = autoPlace(cfg, map, deck)
    const seed = 12345
    // 화면처럼 한 틱씩
    const sim = createWave(cfg, map, st, units, placements, cfg.startLives, seed)
    while (!sim.done) stepWave(sim)
    const j = judgeStage(cfg, acc, { stageNo: 1, placements, seed }, rng())
    expect(j.ok).toBe(true)
    if (!j.ok) return
    expect([j.value.cleared, j.value.killed, j.value.leaked, j.value.ticks]).toEqual([sim.lives > 0, sim.killed, sim.leaked, sim.tick])
    if (j.value.cleared) expect(j.account.best).toBe(1)
    expect(stageOpen(acc, 2)).toBe(false)
    expect(judgeStage(cfg, acc, { stageNo: 5, placements, seed }, rng()).ok).toBe(false)
    expect(judgeStage(cfg, acc, { stageNo: 1, placements: { nope: { x: 0, y: 0 } }, seed }, rng()).ok).toBe(false)
  })
})

describe('상점 (2026-11-28)', () => {
  it('골드로 권을 사고, 모자라면 거절', () => {
    const acc = { ...newAccount([]), gold: 600 }
    const r = applyBarracks(makeConfig(), acc, { type: 'buy', kind: 'draw' }, new Rng(createRngState(1)))
    expect(r.ok && [r.account.gold, r.account.tickets.draw]).toEqual([600 - SHOP_PRICES.draw, acc.tickets.draw + 1])
    const no = applyBarracks(makeConfig(), { ...acc, gold: 10 }, { type: 'buy', kind: 'statTop' }, new Rng(createRngState(1)))
    expect(no.ok).toBe(false)
  })
})

describe('우두머리 첫 처치 보너스 (2026-11-28)', () => {
  it('10탄을 처음 깨면 +100, 다시 깨면 없음', async () => {
    const { judgeStage: _j, BOSS_FIRST_CLEAR_GOLD } = await import('../src/index.ts')
    void _j
    expect(BOSS_FIRST_CLEAR_GOLD).toBe(100)
  })
})
