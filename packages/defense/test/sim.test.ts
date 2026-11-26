// 엔진 tsconfig 는 node 타입을 안 쓰므로 테스트에서 쓰는 것만 선언
declare const process: { env: Record<string, string | undefined> }
declare const console: { log: (...a: unknown[]) => void }

import { describe, expect, it } from 'vitest'
import {
  CELL,
  createRngState,
  createWave,
  agilityChanceBp,
  stepWave,
  type Ability,
  inRange,
  makeConfig,
  MAP_DEFS,
  parseMap,
  positionAt,
  rollRoster,
  runWave,
  stageDef,
  type DefenseConfig,
  type GameMap,
  type Placements,
  type UnitInstance,
  unitStats,
  MONSTER_ABILITIES,
  MONSTER_ABILITY_KINDS,
  type WaveSim,
  autoPlace,
  REFERENCE_MAX_STAGE,
  referenceDeck,
  referenceMaxLoss,
  STAGE_HP_BP,
  stageHpBp,
} from '../src/index.ts'

const unitStatsOf = (sim: WaveSim, speed: number) => unitStats(sim, unit(0, 1, 1, speed, 5)).attackSpeed

const maps = Object.fromEntries(MAP_DEFS.map((d) => [d.id, parseMap(d)])) as Record<string, GameMap>
const cfg = makeConfig()

/** 시험용 자동 배치 = 엔진의 autoPlace (탄 체력 보정에 쓰는 것과 같음) */
export const greedyPlacements = autoPlace

/** 1탄부터 차례로 깨서 어디까지 가나 (매 탄 목숨 새로) + 1~100탄 중 깨는 탄 수 */
function bestStage(roster: readonly UnitInstance[], max = 100): string {
  let first = -1
  let total = 0
  for (let n = 1; n <= max; n++) {
    const st = stageDef(n)
    const map = maps[st.mapId]!
    const r = runWave(createWave(cfg, map, st, roster, greedyPlacements(cfg, map, roster), cfg.startLives))
    if (r.cleared) total++
    else if (first < 0) first = n - 1
  }
  return `${first < 0 ? max : first}탄까지 연속 (1~${max}탄 중 ${total}개 깸)`
}

const unit = (i: number, atk: number, range: number, attackSpeed: number, agility: number): UnitInstance => ({
  id: `t${i}`,
  image: `img${(i % 8) + 1}`,
  atk,
  range,
  attackSpeed,
  agility,
  ability: null,
})

describe('맵', () => {
  it('지그재그: 길 39칸 · 배치 31칸', () => {
    const m = maps.zigzag!
    expect(m.path.length).toBe(39)
    expect(m.tiles.flat().filter((t) => t === 'slot').length).toBe(31)
  })
  it('M자: 길 43칸 · 배치 27칸 · 입구·출구가 아래쪽', () => {
    const m = maps.m!
    expect(m.path.length).toBe(43)
    expect(m.tiles.flat().filter((t) => t === 'slot').length).toBe(27)
    expect(m.path[0]!.y).toBe(9)
    expect(m.path.at(-1)!.y).toBe(9)
  })
  it('몬스터 좌표가 끊기지 않고 이어짐', () => {
    for (const m of Object.values(maps)) {
      let prev = positionAt(m, 0)
      for (let d = 10; d <= m.length; d += 10) {
        const p = positionAt(m, d)
        expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(0.0101 + 1e-9)
        prev = p
      }
      const mid = positionAt(m, 5 * CELL + CELL / 2)
      expect(mid).toEqual({ x: m.path[5]!.x + 0.5, y: m.path[5]!.y + 0.5 })
    }
  })
})

describe('탄', () => {
  it('같은 탄 번호면 같은 구성', () => {
    expect(stageDef(37)).toEqual(stageDef(37))
    expect(stageDef(150).stage).toBe(150) // 무한 구간
  })
  it('10탄마다 우두머리, 10탄부터 몬스터 능력', () => {
    expect(stageDef(10).isBoss).toBe(true)
    expect(stageDef(11).isBoss).toBe(false)
    const abil = (n: number) => Object.values(stageDef(n).monsters).flatMap((m) => m!.abilities)
    expect(abil(5).length).toBe(0)
    expect(abil(15).length).toBeGreaterThan(0)
    expect(abil(75).length).toBeGreaterThan(abil(15).length)
  })
  it('민첩 대결: 내 민첩 ÷ (내 민첩 + 상대 민첩)', () => {
    expect(agilityChanceBp(11, 8)).toBe(5789) // 11/19
    expect(agilityChanceBp(10, 10)).toBe(5000)
    expect(agilityChanceBp(5, 0)).toBe(10000)
  })
})

describe('진행', () => {
  const roster = rollRoster(cfg, createRngState('test')).units

  it('같은 배치면 같은 결과 (명중 확률 포함, 결정적)', () => {
    for (const n of [1, 25, 70]) {
      const st = stageDef(n)
      const map = maps[st.mapId]!
      const p = greedyPlacements(cfg, map, roster)
      expect(runWave(createWave(cfg, map, st, roster, p, 20))).toEqual(runWave(createWave(cfg, map, st, roster, p, 20)))
    }
  })

  it('배치 규칙: 길 위·같은 칸·다른 맵은 거부', () => {
    const st = stageDef(1)
    const map = maps[st.mapId]!
    expect(() => createWave(cfg, map, st, roster, { [roster[0]!.id]: { x: 0, y: 0 } }, 20)).toThrow()
    expect(() => createWave(cfg, map, st, roster, { [roster[0]!.id]: { x: 0, y: 1 }, [roster[1]!.id]: { x: 0, y: 1 } }, 20)).toThrow()
    const other = Object.values(maps).find((m) => m.id !== st.mapId)!
    expect(() => createWave(cfg, other, st, roster, {}, 20)).toThrow()
  })

  it('특수능력 7종 (확률 100%로 시험): 발동·결정성', () => {
    // 몬스터가 판 끝까지 오는 탄이어야 뒤쪽 캐릭도 공격함
    const st = stageDef(45)
    const map = maps[st.mapId]!
    const abilities: Ability[] = [
      // 단순 배치는 앞 순서 캐릭부터 좋은 자리 → 뒤쪽 캐릭까지 몬스터가 오게 약한 능력을 앞에
      { kind: 'obstacle', chanceBp: 10000, obstacle: 'damage' },
      { kind: 'recall', chanceBp: 10000 },
      { kind: 'stun', chanceBp: 10000, durationMs: 1500 },
      { kind: 'teamLevel', chanceBp: 10000, stat: 'all', level: 3 },
      { kind: 'splash', chanceBp: 10000 },
      { kind: 'crit', chanceBp: 10000 },
      { kind: 'allAttack', chanceBp: 10000 },
    ]
    const cfg = makeConfig({ maxDeploy: abilities.length }) // 7종 모두 출전
    const ros = abilities.map((ability, i) => ({ ...unit(i, 20, 2, 1, 8), ability }))
    const p = greedyPlacements(cfg, map, ros)
    const sim = createWave(cfg, map, st, ros, p, 20)
    const kinds = new Set<string>()
    let stunned = false
    let recalled = false
    while (!sim.done) {
      const before = new Map(sim.monsters.map((m) => [m.id, m.dist]))
      stepWave(sim)
      for (const e of sim.events) if (e.type === 'proc') kinds.add(e.kind)
      if (sim.monsters.some((m) => sim.tick <= m.stunnedUntil)) stunned = true
      if (sim.monsters.some((m) => (before.get(m.id) ?? 0) > 2000 && m.dist === 0)) recalled = true
    }
    expect([...kinds].sort()).toEqual(['allAttack', 'crit', 'obstacle', 'recall', 'splash', 'stun', 'teamLevel'])
    expect(sim.obstacles.length).toBe(1) // 판당 1회
    expect(stunned && recalled).toBe(true)
    expect(runWave(createWave(cfg, map, st, ros, p, 20))).toEqual(runWave(createWave(cfg, map, st, ros, p, 20)))
  })

  it('공속 N = 1초에 정확히 N대 (레벨업 중 최대 8)', () => {
    // 체력이 아주 많은 몬스터 한 마리를 사거리 안에 계속 두고 10초 동안 공격 횟수를 셈
    const st = stageDef(1)
    const map = maps[st.mapId]!
    const slot = { x: 0, y: 1 } // 지그재그 1행 길 바로 아래
    for (const speed of [1, 2, 3, 4, 5]) {
      const ros = [unit(0, 1, 9, speed, 100)]
      const sim = createWave(cfg, map, { ...st, groups: [{ monster: 'normal', count: 1, delayMs: 0, intervalMs: 0 }] }, ros, { t0: slot }, 20)
      sim.monsters.length = 0
      stepWave(sim) // 출현
      const m = sim.monsters[0]!
      m.hp = m.maxHp = 1e9
      m.speed = 0
      let hits = 0
      for (let t = 0; t < 200; t++) {
        stepWave(sim)
        hits += sim.events.filter((e) => e.type === 'hit' || e.type === 'miss').length
      }
      expect(hits).toBe(speed * 10) // 10초
    }
    const sim = createWave(cfg, map, st, [unit(0, 1, 1, 5, 5)], {}, 20)
    sim.levelBuffs.push({ stat: 'speed', level: 3, until: 1e9 }, { stat: 'all', level: 3, until: 1e9 })
    expect(unitStatsOf(sim, 5)).toBe(8)
  })

  it('몬스터 능력 9종 (확률 100%로 시험): 발동·횟수 제한·효과·결정성', () => {
    const base = stageDef(1)
    const map = maps[base.mapId]!
    const ros = Array.from({ length: 6 }, (_, i) => unit(i, 12, 2, 2, 1))
    const p = greedyPlacements(cfg, map, ros)
    for (const kind of MONSTER_ABILITY_KINDS) {
      const def = MONSTER_ABILITIES[kind] as { chanceBp: number }
      const saved = def.chanceBp
      def.chanceBp = 10_000
      try {
        const spec = { ...base.monsters.normal!, hp: 400, abilities: [kind] }
        const stage = { ...base, monsters: { normal: spec }, groups: [{ monster: 'normal' as const, count: 4, delayMs: 0, intervalMs: 1500 }] }
        const run = () => {
          const sim = createWave(cfg, map, stage, ros, p, 20)
          const fired = new Map<number, number>()
          let blocked = 0
          let invincibleHit = false
          while (!sim.done) {
            const inv = new Set(sim.monsters.filter((m) => sim.tick < m.invincibleUntil).map((m) => m.id))
            stepWave(sim)
            for (const e of sim.events) {
              if (e.type === 'mskill' && e.kind === kind) fired.set(e.monsterId, (fired.get(e.monsterId) ?? 0) + 1)
              // 순간이동은 출구 앞 칸 가운데까지만 (바로 새지 않음)
              if (e.type === 'mskill' && e.kind === 'blink') expect(e.dist).toBeLessThanOrEqual(map.length - CELL / 2)
              if (e.type === 'block') blocked++
              if (e.type === 'hit' && inv.has(e.monsterId) && !e.splash) invincibleHit = true
            }
            // 날려 보내기: 캐릭은 항상 서로 다른 배치 칸에
            const cells = sim.units.map((u) => `${u.cell.x},${u.cell.y}`)
            expect(new Set(cells).size).toBe(cells.length)
            for (const u of sim.units) expect(map.tiles[u.cell.y]![u.cell.x]).toBe('slot')
          }
          return { sim, fired, blocked, invincibleHit }
        }
        const r = run()
        expect(r.fired.size, kind).toBeGreaterThan(0)
        const uses = MONSTER_ABILITIES[kind].uses
        if (uses) for (const n of r.fired.values()) expect(n, kind).toBeLessThanOrEqual(uses)
        if (kind === 'invincible') {
          expect(r.blocked).toBeGreaterThan(0)
          expect(r.invincibleHit).toBe(false)
        }
        const r2 = run()
        expect([r2.sim.tick, r2.sim.lives, r2.sim.killed, [...r2.fired]]).toEqual([r.sim.tick, r.sim.lives, r.sim.killed, [...r.fired]])
      } finally {
        def.chanceBp = saved
      }
    }
  })

  it('탄 체력 표: 1~70탄 모두 기준 덱이 목숨 절반 남기고 깸 (npm run calibrate 결과와 맞는지)', () => {
    expect(STAGE_HP_BP.length).toBe(REFERENCE_MAX_STAGE)
    for (let n = 1; n <= REFERENCE_MAX_STAGE; n++) {
      const st = stageDef(n)
      const map = maps[st.mapId]!
      const deck = referenceDeck(n)
      const r = runWave(createWave(cfg, map, st, deck, autoPlace(cfg, map, deck), cfg.startLives))
      const totalLeak = st.groups.reduce((s, g) => s + g.count * st.monsters[g.monster]!.leak, 0)
      expect(r.cleared && cfg.startLives - r.lives <= referenceMaxLoss(cfg.startLives, totalLeak), `${n}탄 — 규칙을 바꿨으면 npm run calibrate`).toBe(true)
    }
    // 71탄부터 +3% (정수)
    expect(stageHpBp(71)).toBe(Math.floor((STAGE_HP_BP[69]! * 10300) / 10000))
    expect(stageHpBp(150)).toBeGreaterThan(stageHpBp(100))
  })

  it('아무도 없으면 전부 출구로', () => {
    const st = stageDef(1)
    const r = runWave(createWave(cfg, maps[st.mapId]!, st, roster, {}, 100))
    expect(r.leaked).toBe(st.groups.reduce((s, g) => s + g.count, 0))
  })

  it('난이도 곡선 참고 (SIM=1 일 때 출력): 간단 배치로 어디까지 가나', () => {
    if (!process.env.SIM) return
    const make = (atk: number, range: number, attackSpeed: number, acc: number) =>
      Array.from({ length: cfg.maxDeploy }, (_, i) => unit(i, atk, range, attackSpeed, acc))
    const rows = [
      `최저 덱 (공10·사1·공속1·민첩5): ${bestStage(make(10, 1, 1, 5))}`,
      `평균 덱 (공20·사1~2·공속3·민첩8): ${bestStage(make(20, 1, 3, 8).map((u, i) => ({ ...u, range: i % 2 ? 2 : 1 })))}`,
      `최고 덱 (공30·사2·공속5·민첩10): ${bestStage(make(30, 2, 5, 10))}`,
    ]
    for (let s = 0; s < 6; s++) {
      const ros = rollRoster(makeConfig({ abilityChanceBp: 0 }), createRngState(`r${s}`)).units
      rows.push(`무작위 덱 ${s} (능력 없음): ${bestStage(ros)}`)
    }
    for (let s = 0; s < 6; s++) {
      const ros = rollRoster(makeConfig({ abilityChanceBp: 10_000 }), createRngState(`r${s}`)).units
      rows.push(`무작위 덱 ${s} (전원 특수능력): ${bestStage(ros)}`)
    }
    console.log(rows.join('\n'))
  }, 120_000)
})
