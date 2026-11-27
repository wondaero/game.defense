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
  orderedMapIds,
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
  referencePasses,
  starsFor,
  baseStats,
  statScore,
  type MonsterAbilityKind,
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
  it('알파벳 맵 26개 (엑셀에서 가져옴): 모두 7×9, 한 줄 길, 출전 10명을 세울 배치 칸', () => {
    expect(Object.keys(maps).join('')).toBe('abcdefghijklmnopqrstuvwxyz')
    for (const m of Object.values(maps)) {
      expect([m.width, m.height]).toEqual([7, 9])
      expect(m.path.length).toBeGreaterThanOrEqual(15)
      expect(m.tiles.flat().filter((t) => t === 'slot').length).toBeGreaterThanOrEqual(10)
    }
    expect(maps.e!.path.length).toBe(33)
    expect(maps.l!.path.length).toBe(15)
  })
  it('탄 → 맵: 쉬운 맵부터 난이도 순서(mapOrder)로 4탄씩, 104탄 뒤엔 처음부터 다시', () => {
    const ids = orderedMapIds()
    expect([...ids].sort().join('')).toBe('abcdefghijklmnopqrstuvwxyz')
    expect([1, 4, 5, 104, 105].map((n) => stageDef(n).mapId)).toEqual([ids[0], ids[0], ids[1], ids[25], ids[0]])
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

  it('특수능력 8종 (확률 100%로 시험): 발동·결정성', () => {
    // 몬스터가 판 끝까지 오는 탄이어야 뒤쪽 캐릭도 공격함 → 길이 긴 m 맵으로 고정
    const st = { ...stageDef(49), mapId: 'm' }
    const map = maps.m!
    const abilities: Ability[] = [
      // 단순 배치는 앞 순서 캐릭부터 좋은 자리 → 뒤쪽 캐릭까지 몬스터가 오게 약한 능력을 앞에
      { kind: 'obstacle', chanceBp: 10000, obstacle: 'damage', amountBp: 1000 },
      { kind: 'recall', chanceBp: 10000 },
      { kind: 'stun', chanceBp: 10000, durationMs: 1500 },
      { kind: 'teamLevel', chanceBp: 10000, stat: 'all', level: 3 },
      { kind: 'splash', chanceBp: 10000 },
      { kind: 'crit', chanceBp: 10000 },
      { kind: 'allAttack', chanceBp: 10000 },
      { kind: 'poison', chanceBp: 10000, pctBp: 3000 },
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
    expect([...kinds].sort()).toEqual(['allAttack', 'crit', 'obstacle', 'poison', 'recall', 'splash', 'stun', 'teamLevel'])
    expect(sim.obstacles.length).toBe(1) // 판당 1회
    expect(stunned && recalled).toBe(true)
    expect(runWave(createWave(cfg, map, st, ros, p, 20))).toEqual(runWave(createWave(cfg, map, st, ros, p, 20)))
  })

  it('맹독: 몬스터당 한 번만 걸리고(중첩 없음) 1초마다 공격력의 % 피해 (방어 무시)', () => {
    const st = stageDef(12)
    const map = maps[st.mapId]!
    const cfg1 = makeConfig({ maxDeploy: 1 })
    const ros = [{ ...unit(0, 20, 16, 5, 10), ability: { kind: 'poison', chanceBp: 10000, pctBp: 3000 } as Ability }]
    const spot = map.tiles.flat().indexOf('slot')
    const sim = createWave(cfg1, map, { ...st, groups: [{ monster: st.groups[0]!.monster, count: 1, delayMs: 0, intervalMs: 0 }] }, ros, { t0: { x: spot % map.width, y: Math.floor(spot / map.width) } }, 20)
    stepWave(sim)
    const m = sim.monsters[0]!
    m.hp = m.maxHp = 1e9
    m.speed = 0
    const ticks: number[] = []
    for (let t = 0; t < 100; t++) {
      stepWave(sim)
      for (const e of sim.events) if (e.type === 'poison') ticks.push(e.amount)
    }
    expect(m.poisonDmg).toBe(6) // 공격력 20 × 30%
    expect(ticks.length).toBeGreaterThanOrEqual(4) // 5초 동안 1초마다
    expect(new Set(ticks)).toEqual(new Set([6])) // 여러 번 맞아도 중첩 없음
  })

  it('판 씨앗: 다시 하면 장애물 자리가 달라지고, 같은 씨앗이면 같음', () => {
    const st = stageDef(12)
    const map = maps[st.mapId]!
    const cfg = makeConfig({ maxDeploy: 1 })
    const ros = [{ ...unit(0, 20, 2, 1, 8), ability: { kind: 'obstacle', chanceBp: 10000, obstacle: 'damage', amountBp: 1000 } as Ability }]
    const p = greedyPlacements(cfg, map, ros)
    const spot = (seed: number) => {
      const sim = createWave(cfg, map, st, ros, p, 20, seed)
      while (!sim.done && !sim.obstacles.length) stepWave(sim)
      return sim.obstacles[0]?.index
    }
    const spots = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(spot))
    expect(spots.size).toBeGreaterThan(3) // 판마다 다른 자리
    expect(spot(12345)).toBe(spot(12345)) // 같은 씨앗 = 같은 결과 (서버 검증)
  })

  it('공속 N = 1초에 정확히 N대 (레벨업 중 최대 8)', () => {
    // 체력이 아주 많은 몬스터 한 마리를 사거리 안에 계속 두고 10초 동안 공격 횟수를 셈
    const st = stageDef(1)
    const map = maps[st.mapId]!
    // 맵의 첫 배치 칸 (사거리 16이라 판 어디든 닿음)
    const slot = { x: map.tiles.flat().indexOf('slot') % map.width, y: Math.floor(map.tiles.flat().indexOf('slot') / map.width) }
    for (const speed of [1, 2, 3, 4, 5]) {
      const ros = [unit(0, 1, 16, speed, 100)]
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
              if (e.type === 'mskill' && e.kind === 'blink') expect(e.dist).toBeLessThanOrEqual(map.length - CELL)
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

  it('탄 체력 표: 1~70탄 모두 기준 덱이 겨우 깸 (npm run calibrate 결과와 맞는지)', () => {
    expect(STAGE_HP_BP.length).toBe(REFERENCE_MAX_STAGE)
    for (let n = 1; n <= REFERENCE_MAX_STAGE; n++) {
      const st = stageDef(n)
      const map = maps[st.mapId]!
      const deck = referenceDeck(n)
      const r = runWave(createWave(cfg, map, st, deck, autoPlace(cfg, map, deck), cfg.startLives))
      expect(referencePasses(r), `${n}탄 — 규칙을 바꿨으면 npm run calibrate`).toBe(true)
    }
    // 71탄부터: 61~69탄 평균(우두머리 탄은 70탄 값) 바탕으로 탄마다 +3% (정수)
    const tail = STAGE_HP_BP.slice(60, 69)
    const normalBase = Math.floor(tail.reduce((a, b) => a + b, 0) / tail.length)
    expect(stageHpBp(71)).toBe(Math.floor((normalBase * 10300) / 10000))
    expect(stageHpBp(80)).toBeLessThan(stageHpBp(79)) // 우두머리 탄은 일반 탄보다 배율 낮음 (우두머리가 단단하니까)
    expect(stageHpBp(150)).toBeGreaterThan(stageHpBp(100))
  })

  it('전체 강화: 공격력·공속·민첩 모두 × 1.1/1.2/1.3 (최대를 넘을 수 있음, 사거리 그대로, 봉인 중엔 원래 값), 헬멧 점수도 올라감', () => {
    const base = unit(0, 17, 1, 3, 7)
    const b = (mulBp: number) => ({ ...base, ability: { kind: 'boostAll', chanceBp: 0, mulBp } as Ability })
    expect(baseStats(cfg, b(11_000))).toEqual({ atk: 18, range: 1, attackSpeed: 3.3, agility: 7.7 }) // 17 × 1.1 = 18.7 → 내림
    expect(baseStats(cfg, b(12_000))).toEqual({ atk: 20, range: 1, attackSpeed: 3.6, agility: 8.4 })
    expect(baseStats(cfg, { ...unit(0, 30, 2, 5, 10), ability: { kind: 'boostAll', chanceBp: 0, mulBp: 13_000 } })).toEqual({ atk: 39, range: 2, attackSpeed: 6.5, agility: 13 }) // 최대 초과
    expect(baseStats(cfg, b(13_000), true)).toEqual({ atk: 17, range: 1, attackSpeed: 3, agility: 7 }) // 봉인
    expect(statScore(cfg, b(13_000))).toBeGreaterThan(statScore(cfg, base))
  })

  it('몬스터 봉인: 걸린 캐릭은 3초 동안 특수능력이 발동 안 함', () => {
    const st0 = stageDef(12)
    const map = maps[st0.mapId]!
    const t = st0.groups[0]!.monster
    const spec = { ...st0.monsters[t]!, abilities: ['seal'] as MonsterAbilityKind[] }
    const st = { ...st0, monsters: { [t]: spec }, groups: [{ monster: t, count: 1, delayMs: 0, intervalMs: 0 }] }
    const cfg1 = makeConfig({ maxDeploy: 1 })
    // 민첩 0 → 봉인을 못 피함. 2배 데미지 확률 100% 로 발동 여부를 봄
    const ros = [{ ...unit(0, 1, 16, 5, 0), ability: { kind: 'crit', chanceBp: 10000 } as Ability }]
    const spot = map.tiles.flat().indexOf('slot')
    const sim = createWave(cfg1, map, st, ros, { t0: { x: spot % map.width, y: Math.floor(spot / map.width) } }, 20)
    let sealedTicks = 0
    let procsWhileSealed = 0
    let procs = 0
    for (let k = 0; k < 200; k++) {
      const sealedBefore = sim.tick < sim.units[0]!.sealedUntil
      stepWave(sim)
      const m = sim.monsters[0]
      if (m) {
        m.hp = m.maxHp = 1e9
        m.speed = 0
      }
      if (sealedBefore) sealedTicks++
      for (const e of sim.events) if (e.type === 'proc') sealedBefore ? procsWhileSealed++ : procs++
    }
    expect(sealedTicks).toBeGreaterThan(0)
    expect(procs).toBeGreaterThan(0)
    expect(procsWhileSealed).toBe(0)
  })

  it('통과 규칙: 3마리째 통과하면 실패, 별 = 통과 0 → 3개 · 1 → 2개 · 2 → 1개', () => {
    expect([0, 1, 2].map((k) => starsFor(true, k))).toEqual([3, 2, 1])
    expect(starsFor(false, 3)).toBe(0)
    const st = stageDef(1)
    const r = runWave(createWave(cfg, maps[st.mapId]!, st, roster, {}, cfg.startLives))
    expect(cfg.startLives).toBe(3)
    expect([r.cleared, r.leaked, r.stars]).toEqual([false, 3, 0]) // 아무도 안 세우면 3마리째에 끝
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
