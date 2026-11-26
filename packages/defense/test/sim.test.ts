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
} from '../src/index.ts'

const maps = Object.fromEntries(MAP_DEFS.map((d) => [d.id, parseMap(d)])) as Record<string, GameMap>
const cfg = makeConfig()

/** 사거리 안 길 칸이 많은 배치 칸부터 차례로 (시험용 간단 배치) */
export function greedyPlacements(cfg: DefenseConfig, map: GameMap, roster: readonly UnitInstance[]): Placements {
  const slots: { x: number; y: number }[] = []
  map.tiles.forEach((row, y) => row.forEach((t, x) => t === 'slot' && slots.push({ x, y })))
  // 이미 많이 덮인 길 칸은 점수를 덜 줌 → 화력이 길 전체에 고르게
  const cover = map.path.map(() => 0)
  const score = (s: { x: number; y: number }, r: number) =>
    map.path.reduce((sum, c, i) => sum + (inRange(s, c, r, cfg.rangeShape) ? 1 / (1 + cover[i]!) : 0), 0)
  const units = [...roster].sort((a, b) => b.atk - a.atk).slice(0, cfg.maxDeploy)
  const p: Placements = {}
  const used = new Set<string>()
  for (const u of units) {
    const best = slots.filter((s) => !used.has(`${s.x},${s.y}`)).sort((a, b) => score(b, u.range) - score(a, u.range))[0]!
    used.add(`${best.x},${best.y}`)
    p[u.id] = best
    map.path.forEach((c, i) => inRange(best, c, u.range, cfg.rangeShape) && cover[i]!++)
  }
  return p
}

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

const unit = (i: number, atk: number, range: number, interval: number, agility: number): UnitInstance => ({
  id: `t${i}`,
  image: `img${i + 1}`,
  atk,
  range,
  interval,
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

  it('특수능력 6종 (확률 100%로 시험): 발동·결정성', () => {
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
    ]
    const ros = abilities.map((ability, i) => ({ ...unit(i, 20, 2, 1000, 8), ability }))
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
    expect([...kinds].sort()).toEqual(['crit', 'obstacle', 'recall', 'splash', 'stun', 'teamLevel'])
    expect(sim.obstacles.length).toBe(1) // 판당 1회
    expect(stunned && recalled).toBe(true)
    expect(runWave(createWave(cfg, map, st, ros, p, 20))).toEqual(runWave(createWave(cfg, map, st, ros, p, 20)))
  })

  it('아무도 없으면 전부 출구로', () => {
    const st = stageDef(1)
    const r = runWave(createWave(cfg, maps[st.mapId]!, st, roster, {}, 100))
    expect(r.leaked).toBe(st.groups.reduce((s, g) => s + g.count, 0))
  })

  it('난이도 곡선 참고 (SIM=1 일 때 출력): 간단 배치로 어디까지 가나', () => {
    if (!process.env.SIM) return
    const make = (atk: number, range: number, interval: number, acc: number) =>
      Array.from({ length: 6 }, (_, i) => unit(i, atk, range, interval, acc))
    const rows = [
      `최저 덱 (공10·사1·1.5초·민첩5): ${bestStage(make(10, 1, 1500, 5))}`,
      `평균 덱 (공20·사1~2·1.0초·민첩8): ${bestStage(make(20, 1, 1000, 8).map((u, i) => ({ ...u, range: i % 2 ? 2 : 1 })))}`,
      `최고 덱 (공30·사2·0.6초·민첩10): ${bestStage(make(30, 2, 600, 10))}`,
    ]
    for (let s = 0; s < 6; s++) {
      const ros = rollRoster(makeConfig({ abilityChanceBp: 0 }), createRngState(`r${s}`)).units
      rows.push(`무작위 덱 ${s} (능력 없음): ${bestStage(ros)}`)
    }
    console.log(rows.join('\n'))
  }, 120_000)
})
