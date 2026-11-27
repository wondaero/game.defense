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
    const j = judgeStage(cfg, acc, { stageNo: 1, placements, seed })
    expect(j.ok).toBe(true)
    if (!j.ok) return
    expect([j.value.cleared, j.value.killed, j.value.leaked, j.value.ticks]).toEqual([sim.lives > 0, sim.killed, sim.leaked, sim.tick])
    if (j.value.cleared) expect(j.account.best).toBe(1)
    expect(stageOpen(acc, 2)).toBe(false)
    expect(judgeStage(cfg, acc, { stageNo: 5, placements, seed }).ok).toBe(false)
    expect(judgeStage(cfg, acc, { stageNo: 1, placements: { nope: { x: 0, y: 0 } }, seed }).ok).toBe(false)
  })
})
