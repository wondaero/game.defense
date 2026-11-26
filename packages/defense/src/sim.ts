import {
  ABILITY_COOLDOWN_MS,
  levelBonus,
  OBSTACLE_DAMAGE_BP,
  OBSTACLE_SLOW_BP,
  STUN_IMMUNE_MS,
  TEAM_LEVEL_MS,
  type AbilityKind,
  type BuffStat,
  type ObstacleKind,
} from './abilities.ts'
import { applyBp, BP, msToTicks, type DefenseConfig } from './config.ts'
import { inRange, pathIndexAt, type Cell, type GameMap } from './map.ts'
import { Rng } from './rng.ts'
import type { UnitInstance } from './roster.ts'
import { FREEZE_IMMUNE_MS, MONSTER_ABILITIES, type MonsterId, type MonsterSpec, type StageDef } from './stages.ts'

/**
 * 탄 하나의 진행. 고정 틱 + 정수 계산 + 탄 번호 시드 난수 → 같은 배치면 항상 같은 결과
 * (공유 기록을 서버에서 다시 돌려 확인할 수 있게 화면과 분리).
 *
 * 한 틱의 처리 순서:
 *   출현 → 이동(스턴·늪 반영)·출구 → 얼리기(민첩으로 회피) → 1초마다 가시 장애물
 *   → 캐릭 공격(판 위 칸 순서: 특수능력 발동 판정 → 명중 판정 → 피해) → 사망 정리
 */

export type Placements = Record<string, Cell>

export interface Monster {
  id: number
  type: MonsterId
  spec: MonsterSpec
  hp: number
  maxHp: number
  /** 1틱에 가는 거리 */
  speed: number
  dist: number
  /** 직전 틱 거리 (화면 보간용) */
  prevDist: number
  stunnedUntil: number
  stunImmuneUntil: number
  /** 단단해지기: 이 틱까지 방어력 상승 / 다음 발동 가능 틱 */
  armorUpUntil: number
  armorUpReadyAt: number
  /** 얼리기 다음 발동 가능 틱 */
  freezeReadyAt: number
}

export interface SimUnit {
  inst: UnitInstance
  cell: Cell
  nextAttack: number
  /** 특수능력 다음 발동 가능 틱 (쿨타임) */
  abilityReadyAt: number
  /** 장애물 추가는 판당 1회 */
  obstacleUsed: boolean
  /** 이 틱까지 얼어서 공격 못 함 */
  frozenUntil: number
}

export interface Obstacle {
  /** 길 칸 번호 (map.path 인덱스) */
  index: number
  kind: ObstacleKind
  /** 가시: 1초마다 피해 */
  damage: number
  ownerId: string
}

export type SimEvent =
  | { type: 'hit'; unitId: string; monsterId: number; dist: number; amount: number; crit: boolean; splash: boolean }
  | { type: 'miss'; unitId: string; monsterId: number; dist: number }
  | { type: 'proc'; unitId: string; kind: AbilityKind; monsterId: number; dist: number }
  | { type: 'thorn'; monsterId: number; dist: number; amount: number }
  | { type: 'kill'; monsterId: number; monsterType: MonsterId; dist: number }
  | { type: 'leak'; monsterId: number; lives: number }
  | { type: 'armorUp'; monsterId: number; dist: number }
  | { type: 'freeze'; monsterId: number; dist: number; unitIds: string[]; dodgedIds: string[] }

export interface WaveSim {
  cfg: DefenseConfig
  map: GameMap
  stage: StageDef
  rng: Rng
  tick: number
  spawns: { tick: number; type: MonsterId }[]
  spawnIdx: number
  monsters: Monster[]
  units: SimUnit[]
  obstacles: Obstacle[]
  /** 아군 전체 레벨업 */
  levelBuffs: { stat: BuffStat; level: number; until: number }[]
  lives: number
  killed: number
  leaked: number
  nextMonsterId: number
  /** 이번 틱에 일어난 일 (화면 효과용) */
  events: SimEvent[]
  done: boolean
}

export function validatePlacements(cfg: DefenseConfig, map: GameMap, roster: readonly UnitInstance[], p: Placements): string | null {
  const ids = Object.keys(p)
  if (ids.length > cfg.maxDeploy) return `출전은 ${cfg.maxDeploy}명까지`
  const used = new Set<string>()
  const images = new Set<string>()
  for (const id of ids) {
    const u = roster.find((r) => r.id === id)
    if (!u) return `없는 캐릭: ${id}`
    if (images.has(u.image)) return '같은 그림은 한 명만'
    images.add(u.image)
    const c = p[id]!
    if (map.tiles[c.y]?.[c.x] !== 'slot') return '배치 칸이 아님'
    const k = `${c.x},${c.y}`
    if (used.has(k)) return '한 칸에 한 명만'
    used.add(k)
  }
  return null
}

export function createWave(
  cfg: DefenseConfig,
  map: GameMap,
  stage: StageDef,
  roster: readonly UnitInstance[],
  placements: Placements,
  lives: number,
): WaveSim {
  if (map.id !== stage.mapId) throw new Error(`이 탄의 맵은 ${stage.mapId}`)
  const err = validatePlacements(cfg, map, roster, placements)
  if (err) throw new Error(err)
  const spawns: WaveSim['spawns'] = []
  for (const g of stage.groups) {
    for (let i = 0; i < g.count; i++) spawns.push({ tick: msToTicks(cfg, g.delayMs + g.intervalMs * i) - 1, type: g.monster })
  }
  // 같은 틱이면 그룹 순서대로 (안정 정렬)
  spawns.sort((a, b) => a.tick - b.tick)
  const units: SimUnit[] = roster
    .filter((u) => placements[u.id])
    .map((inst) => ({ inst, cell: placements[inst.id]!, nextAttack: 0, abilityReadyAt: 0, obstacleUsed: false, frozenUntil: -1_000_000 }))
    .sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x)
  return {
    cfg,
    map,
    stage,
    rng: new Rng({ s: stage.seed }),
    tick: 0,
    spawns,
    spawnIdx: 0,
    monsters: [],
    units,
    obstacles: [],
    levelBuffs: [],
    lives,
    killed: 0,
    leaked: 0,
    nextMonsterId: 1,
    events: [],
    done: false,
  }
}

/** 레벨업 버프를 반영한 능력치 */
export function unitStats(sim: WaveSim, inst: UnitInstance) {
  let atk = inst.atk
  let range = inst.range
  let interval = inst.interval
  let agility = inst.agility
  for (const b of sim.levelBuffs) {
    if (sim.tick >= b.until) continue
    const has = (s: BuffStat) => b.stat === s || b.stat === 'all'
    if (has('atk')) atk += levelBonus('atk', b.level)
    if (has('range')) range += levelBonus('range', b.level)
    if (has('speed')) interval -= levelBonus('speed', b.level)
    if (has('agility')) agility += levelBonus('agility', b.level)
  }
  return { atk, range, interval: Math.max(100, interval), agility }
}

/** 지금 방어력 (단단해지기 반영) */
export const monsterArmor = (sim: WaveSim, m: Monster) => m.spec.armor + (sim.tick < m.armorUpUntil ? m.spec.armorUpAmount : 0)

/**
 * 민첩 대결 (basis point): 내 민첩 ÷ (내 민첩 + 상대 민첩).
 * - 내 공격: 이 값이 명중률 (몬스터 입장에선 회피율)
 * - 몬스터 기술(얼리기): 같은 식으로 내가 피할 확률
 * 예) 나 11 · 몬스터 8 → 11/19 ≈ 57.9%
 */
export const agilityChanceBp = (mine: number, theirs: number) => (mine + theirs <= 0 ? BP / 2 : Math.floor((mine * BP) / (mine + theirs)))

const hasM = (m: Monster, k: 'armorUp' | 'freeze') => m.spec.abilities.includes(k)

/** 피해 주기. crit = 공격력×2 − 방어력 */
function damage(sim: WaveSim, u: SimUnit, m: Monster, atk: number, crit: boolean, splash: boolean) {
  const armor = monsterArmor(sim, m)
  const dmg = Math.max(1, (crit ? atk * 2 : atk) - armor)
  m.hp -= dmg
  sim.events.push({ type: 'hit', unitId: u.inst.id, monsterId: m.id, dist: m.dist, amount: dmg, crit, splash })
  // 몬스터 능력: 단단해지기 (맞으면 발동, 다음 공격부터 적용)
  if (hasM(m, 'armorUp') && m.hp > 0 && sim.tick >= m.armorUpReadyAt) {
    const d = MONSTER_ABILITIES.armorUp
    m.armorUpUntil = sim.tick + msToTicks(sim.cfg, d.durationMs)
    m.armorUpReadyAt = sim.tick + msToTicks(sim.cfg, d.cooldownMs)
    sim.events.push({ type: 'armorUp', monsterId: m.id, dist: m.dist })
  }
}

/** 특수능력 발동 판정 (공격할 때, 빗나가도). 쿨타임·판당 1회 반영 */
function rollProc(sim: WaveSim, u: SimUnit): boolean {
  const a = u.inst.ability
  if (!a || sim.tick < u.abilityReadyAt) return false
  if (a.kind === 'obstacle' && u.obstacleUsed) return false
  if (sim.rng.int(BP) >= a.chanceBp) return false
  const cd = ABILITY_COOLDOWN_MS[a.kind]
  if (cd) u.abilityReadyAt = sim.tick + msToTicks(sim.cfg, cd)
  return true
}

/** 한 틱 진행 */
export function stepWave(sim: WaveSim) {
  sim.events = []
  if (sim.done) return
  const { cfg, map } = sim
  const cellOf = (m: Monster) => map.path[pathIndexAt(map, m.dist)]!
  const obstacleAt = (m: Monster) => {
    const i = pathIndexAt(map, m.dist)
    return sim.obstacles.find((o) => o.index === i) ?? null
  }

  // 출현
  while (sim.spawnIdx < sim.spawns.length && sim.spawns[sim.spawnIdx]!.tick <= sim.tick) {
    const s = sim.spawns[sim.spawnIdx++]!
    const spec = sim.stage.monsters[s.type]!
    const hp = Math.max(1, applyBp(spec.hp, cfg.monsterHpBp))
    const speed = Math.max(1, Math.floor((spec.speed * cfg.monsterSpeedBp) / BP / cfg.tickRate))
    sim.monsters.push({
      id: sim.nextMonsterId++,
      type: s.type,
      spec,
      hp,
      maxHp: hp,
      speed,
      dist: 0,
      prevDist: 0,
      stunnedUntil: 0,
      stunImmuneUntil: 0,
      armorUpUntil: 0,
      armorUpReadyAt: 0,
      // 나오자마자 얼리지 않게 1초 뒤부터
      freezeReadyAt: sim.tick + cfg.tickRate,
    })
  }

  // 이동 · 출구
  for (const m of sim.monsters) {
    m.prevDist = m.dist
    if (sim.tick < m.stunnedUntil) continue
    const o = obstacleAt(m)
    const slow = o?.kind === 'slow' ? OBSTACLE_SLOW_BP : 0
    m.dist += Math.max(1, m.speed - applyBp(m.speed, slow))
    if (m.dist >= map.length) {
      m.hp = 0
      sim.lives -= m.spec.leak
      sim.leaked++
      sim.events.push({ type: 'leak', monsterId: m.id, lives: sim.lives })
    }
  }
  sim.monsters = sim.monsters.filter((m) => m.dist < map.length)

  // 몬스터 능력: 얼리기 (주변에 캐릭이 있을 때만 발동, 캐릭은 민첩으로 피할 수 있음)
  for (const m of sim.monsters) {
    if (!hasM(m, 'freeze') || sim.tick < m.freezeReadyAt) continue
    const mc = cellOf(m)
    const immune = msToTicks(cfg, FREEZE_IMMUNE_MS)
    const targets = sim.units.filter((u) => sim.tick >= u.frozenUntil + immune && inRange(mc, u.cell, m.spec.freezeRadius, 'diamond'))
    if (!targets.length) continue
    const d = MONSTER_ABILITIES.freeze
    const until = sim.tick + msToTicks(cfg, d.durationMs)
    const frozen: string[] = []
    const dodged: string[] = []
    for (const u of targets) {
      if (sim.rng.int(BP) < agilityChanceBp(unitStats(sim, u.inst).agility, m.spec.agility)) dodged.push(u.inst.id)
      else {
        u.frozenUntil = until
        frozen.push(u.inst.id)
      }
    }
    m.freezeReadyAt = sim.tick + msToTicks(cfg, d.cooldownMs)
    sim.events.push({ type: 'freeze', monsterId: m.id, dist: m.dist, unitIds: frozen, dodgedIds: dodged })
  }

  // 가시 장애물: 1초마다
  if (sim.tick % cfg.tickRate === 0) {
    for (const m of sim.monsters) {
      const o = obstacleAt(m)
      if (o?.kind !== 'damage') continue
      m.hp -= o.damage
      sim.events.push({ type: 'thorn', monsterId: m.id, dist: m.dist, amount: o.damage })
    }
  }

  // 공격: 사거리 안에서 가장 앞선(출구에 가까운) 몬스터
  for (const u of sim.units) {
    if (sim.tick < u.nextAttack || sim.tick < u.frozenUntil) continue
    const st = unitStats(sim, u.inst)
    let target: Monster | null = null
    for (const m of sim.monsters) {
      if (m.hp <= 0) continue
      if (!inRange(u.cell, cellOf(m), st.range, cfg.rangeShape)) continue
      if (!target || m.dist > target.dist) target = m
    }
    if (!target) continue
    u.nextAttack = sim.tick + msToTicks(cfg, st.interval)

    // 특수능력 (빗나가도 발동)
    const a = u.inst.ability
    const proc = rollProc(sim, u) ? a : null
    if (proc) sim.events.push({ type: 'proc', unitId: u.inst.id, kind: proc.kind, monsterId: target.id, dist: target.dist })
    const immune = (k: AbilityKind) => target!.spec.immunities.includes(k)

    const hit = sim.rng.int(BP) < agilityChanceBp(st.agility, target.spec.agility)
    if (hit) damage(sim, u, target, st.atk, proc?.kind === 'crit', false)
    else sim.events.push({ type: 'miss', unitId: u.inst.id, monsterId: target.id, dist: target.dist })

    if (!proc) continue
    switch (proc.kind) {
      case 'stun':
        if (!immune('stun') && sim.tick >= target.stunImmuneUntil && sim.tick >= target.stunnedUntil) {
          target.stunnedUntil = sim.tick + msToTicks(cfg, proc.durationMs)
          target.stunImmuneUntil = target.stunnedUntil + msToTicks(cfg, STUN_IMMUNE_MS)
        }
        break
      case 'splash': {
        // 맞힌 자리(대상 칸) 중심 3×3의 다른 몬스터 (명중 판정 없음)
        const tc = cellOf(target)
        for (const m of sim.monsters) {
          if (m === target || m.hp <= 0 || m.spec.immunities.includes('splash')) continue
          if (inRange(tc, cellOf(m), 1, 'square')) damage(sim, u, m, st.atk, false, true)
        }
        break
      }
      case 'recall':
        if (!immune('recall') && target.hp > 0) {
          target.dist = 0
          target.prevDist = 0
        }
        break
      case 'obstacle': {
        const free = map.path.map((_, i) => i).filter((i) => !sim.obstacles.some((o) => o.index === i))
        if (free.length) {
          const index = free[sim.rng.int(free.length)]!
          sim.obstacles.push({ index, kind: proc.obstacle, damage: Math.max(1, applyBp(u.inst.atk, OBSTACLE_DAMAGE_BP)), ownerId: u.inst.id })
        }
        u.obstacleUsed = true
        break
      }
      case 'teamLevel':
        sim.levelBuffs.push({ stat: proc.stat, level: proc.level, until: sim.tick + msToTicks(cfg, TEAM_LEVEL_MS) })
        break
      case 'crit':
        break
    }
  }

  // 사망 정리
  for (const m of sim.monsters) {
    if (m.hp <= 0) {
      sim.killed++
      sim.events.push({ type: 'kill', monsterId: m.id, monsterType: m.type, dist: m.dist })
    }
  }
  sim.monsters = sim.monsters.filter((m) => m.hp > 0)
  sim.levelBuffs = sim.levelBuffs.filter((b) => sim.tick < b.until)

  sim.tick++
  if (sim.lives <= 0 || (sim.spawnIdx >= sim.spawns.length && sim.monsters.length === 0)) sim.done = true
}

export interface WaveResult {
  ticks: number
  lives: number
  killed: number
  leaked: number
  cleared: boolean
}

/** 화면 없이 끝까지 (테스트·나중에 서버 검증용) */
export function runWave(sim: WaveSim, maxTicks = 200_000): WaveResult {
  while (!sim.done && sim.tick < maxTicks) stepWave(sim)
  return { ticks: sim.tick, lives: sim.lives, killed: sim.killed, leaked: sim.leaked, cleared: sim.lives > 0 }
}
