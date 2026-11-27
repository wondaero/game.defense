import { describe, expect, it } from 'vitest'
import {
  applyBarracks,
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
    expect(applyBarracks(cfg, acc, { type: 'merge', unitIds: ['u1', 'u2'] }, rng()).ok).toBe(false)
    expect(applyBarracks(cfg, acc, { type: 'merge', unitIds: ['u1', 'u2', 'nope'] }, rng()).ok).toBe(false)
    const rich = { ...acc, tickets: { ...acc.tickets, statHigh: 1 } }
    expect(applyBarracks(cfg, rich, { type: 'rerollStats', unitId: 'u1', grade: 'statHigh', keep: [] }, rng()).ok).toBe(false) // 1개 골라야 함
    const ok = applyBarracks(cfg, rich, { type: 'rerollStats', unitId: 'u1', grade: 'statHigh', keep: ['atk'] }, rng())
    expect(ok.ok && ok.account.tickets.statHigh).toBe(0)
  })

  it('뽑기·합성: 권이 줄고/늘고, 막사가 꽉 차면 못 뽑음', () => {
    const acc = newAccount(units.slice(0, 3))
    const d = applyBarracks(cfg, acc, { type: 'draw' }, rng())
    expect(d.ok && [d.account.units.length, d.account.tickets.draw, d.account.nextUnitId]).toEqual([4, 4, 5])
    const m = applyBarracks(cfg, acc, { type: 'merge', unitIds: ['u1', 'u2', 'u3'] }, rng())
    expect(m.ok && m.account.units.length).toBe(0)
    const full = newAccount(units) // 100명
    expect(applyBarracks(cfg, full, { type: 'draw' }, rng()).ok).toBe(false)
  })

  it('탄 보상: 처음 깨면 화폐 2배 + 가끔 권, 다시 깨면 화폐만, 실패면 없음', () => {
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
    expect(firstGold).toBe(stageGold(1) * 2)
    expect(tickets).toBeGreaterThan(10) // 약 10%
    expect(tickets).toBeLessThan(60)
    const again = { ...acc, best: 1, stars: { 1: 3 } }
    for (let i = 0; i < 50; i++) {
      const j = judgeStage(cfg, again, { stageNo: 1, placements, seed: 7 }, new Rng(createRngState(i)))
      expect(j.ok && [j.value.reward.gold, j.value.reward.ticket, j.account.gold]).toEqual([stageGold(1), null, stageGold(1)])
    }
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
