import {
  ABILITY_COOLDOWN_MS,
  levelBonus,
  OBSTACLE_DAMAGE_BP,
  OBSTACLE_SLOW_BP,
  STUN_IMMUNE_MS,
  TEAM_LEVEL_MS,
  type Ability,
  type AbilityKind,
  type BuffStat,
  type ObstacleKind,
} from './abilities.ts'
import { applyBp, ATTACK_WINDOW_MS, BP, MAX_ATTACK_SPEED, msToTicks, type DefenseConfig } from './config.ts'
import { CELL, inRange, pathIndexAt, type Cell, type GameMap } from './map.ts'
import { Rng } from './rng.ts'
import type { UnitInstance } from './roster.ts'
import {
  BLINK_CELLS,
  FREEZE_IMMUNE_MS,
  GROUP_HEAL_BP,
  MONSTER_ABILITIES,
  MONSTER_ABILITY_KINDS,
  type MonsterAbilityKind,
  type MonsterId,
  type MonsterSpec,
  type StageDef,
} from './stages.ts'

/**
 * 탄 하나의 진행. 고정 틱 + 정수 계산 + 탄 번호 시드 난수 → 같은 배치면 항상 같은 결과
 * (공유 기록을 서버에서 다시 돌려 확인할 수 있게 화면과 분리).
 *
 * 한 틱의 처리 순서:
 *   출현 → 이동(스턴·늪·질주 반영)·출구 → 1초마다 가시 장애물
 *   → 캐릭 공격(판 위 칸 순서: 특수능력 발동 판정 → 명중 판정 → 피해 → 맞은 몬스터의 능력 판정) → 사망 정리
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
  /** 단단해지기: 이 틱까지 방어력 상승 */
  armorUpUntil: number
  /** 질주: 이 틱까지 이동속도 2배 */
  hasteUntil: number
  /** 무적: 이 틱까지 피해·스턴·출발지로 보내기 안 통함 */
  invincibleUntil: number
  /** 능력별 다음 발동 가능 틱 (쿨타임) */
  abilityReadyAt: Partial<Record<MonsterAbilityKind, number>>
  /** 능력별 쓴 횟수 (마리당 횟수 제한) */
  abilityUsed: Partial<Record<MonsterAbilityKind, number>>
}

export interface SimUnit {
  inst: UnitInstance
  cell: Cell
  /**
   * 공격 게이지: 매 틱 공속×2 만큼 차고(약화 중엔 공속×1), 1초 틱 수×2 가 되면 한 대.
   * 정수 누적이라 공속 3 = 정확히 1초에 3대 (간격이 나누어떨어지지 않아도 오차 없음).
   * ×2 는 약화(공속 절반)도 정수로 계산하려고
   */
  atkGauge: number
  /** 약화: 이 틱까지 공속·명중률 절반 */
  weakenedUntil: number
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
  /** 무적이라 피해가 안 들어감 */
  | { type: 'block'; unitId: string; monsterId: number; dist: number }
  /** 몬스터 능력 발동. unitIds = 걸린 캐릭, dodgedIds = 민첩으로 피한 캐릭 */
  | { type: 'mskill'; kind: MonsterAbilityKind; monsterId: number; dist: number; unitIds: string[]; dodgedIds: string[] }

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
  /** 1초(ATTACK_WINDOW_MS)의 틱 수 */
  windowTicks: number
  /** 이번 틱에 일어난 일 (화면 효과용) */
  events: SimEvent[]
  done: boolean
}

export function validatePlacements(cfg: DefenseConfig, map: GameMap, roster: readonly UnitInstance[], p: Placements): string | null {
  const ids = Object.keys(p)
  if (ids.length > cfg.maxDeploy) return `출전은 ${cfg.maxDeploy}명까지`
  // 같은 그림·같은 특수능력도 여러 명 가능 (2026-11-26)
  const used = new Set<string>()
  for (const id of ids) {
    const u = roster.find((r) => r.id === id)
    if (!u) return `없는 캐릭: ${id}`
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
  const windowTicks = msToTicks(cfg, ATTACK_WINDOW_MS)
  const units: SimUnit[] = roster
    .filter((u) => placements[u.id])
    // 게이지가 찬 채로 시작 → 첫 몬스터가 들어오면 바로 공격
    .map((inst) => ({ inst, cell: { ...placements[inst.id]! }, atkGauge: windowTicks * 2, weakenedUntil: 0, abilityReadyAt: 0, obstacleUsed: false, frozenUntil: -1_000_000 }))
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
    windowTicks,
    events: [],
    done: false,
  }
}

/** 레벨업 버프를 반영한 능력치 */
export function unitStats(sim: WaveSim, inst: UnitInstance) {
  let atk = inst.atk
  let range = inst.range
  let attackSpeed = inst.attackSpeed
  let agility = inst.agility
  for (const b of sim.levelBuffs) {
    if (sim.tick >= b.until) continue
    const has = (s: BuffStat) => b.stat === s || b.stat === 'all'
    if (has('atk')) atk += levelBonus('atk', b.level)
    if (has('range')) range += levelBonus('range', b.level)
    if (has('speed')) attackSpeed += levelBonus('speed', b.level)
    if (has('agility')) agility += levelBonus('agility', b.level)
  }
  // 한 틱에 두 번 치지 않게 windowTicks 이하로도 묶음 (초당 20틱이면 20)
  return { atk, range, attackSpeed: Math.max(1, Math.min(MAX_ATTACK_SPEED, sim.windowTicks, attackSpeed)), agility }
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

export const isInvincible = (sim: WaveSim, m: Monster) => sim.tick < m.invincibleUntil

/** 피해 주기. crit = 공격력×2 − 방어력. 무적이면 안 들어감 */
function damage(sim: WaveSim, u: SimUnit, m: Monster, atk: number, crit: boolean, splash: boolean) {
  if (isInvincible(sim, m)) {
    sim.events.push({ type: 'block', unitId: u.inst.id, monsterId: m.id, dist: m.dist })
    return
  }
  const armor = monsterArmor(sim, m)
  const dmg = Math.max(1, (crit ? atk * 2 : atk) - armor)
  m.hp -= dmg
  sim.events.push({ type: 'hit', unitId: u.inst.id, monsterId: m.id, dist: m.dist, amount: dmg, crit, splash })
}

/** 캐릭이 몬스터 기술을 민첩으로 피하나 */
const dodges = (sim: WaveSim, u: SimUnit, m: Monster) => sim.rng.int(BP) < agilityChanceBp(unitStats(sim, u.inst).agility, m.spec.agility)

/** 비어 있는 배치 칸 */
function freeSlots(sim: WaveSim): Cell[] {
  const used = new Set(sim.units.map((u) => `${u.cell.x},${u.cell.y}`))
  const out: Cell[] = []
  sim.map.tiles.forEach((row, y) => row.forEach((t, x) => t === 'slot' && !used.has(`${x},${y}`) && out.push({ x, y })))
  return out
}

/**
 * 몬스터 능력: 캐릭 u 에게 공격받았을 때(빗나가도) 판정.
 * MONSTER_ABILITY_KINDS 순서로, 쿨타임·마리당 횟수가 남은 것만 확률을 굴린다.
 * 효과를 낼 대상이 없으면(얼릴 캐릭 없음 등) 쿨타임·횟수를 쓰지 않는다.
 */
function monsterReact(sim: WaveSim, u: SimUnit, m: Monster) {
  const { cfg, map } = sim
  for (const kind of MONSTER_ABILITY_KINDS) {
    if (m.hp <= 0) return
    if (!m.spec.abilities.includes(kind)) continue
    const d = MONSTER_ABILITIES[kind]
    if (sim.tick < (m.abilityReadyAt[kind] ?? 0)) continue
    if (d.uses && (m.abilityUsed[kind] ?? 0) >= d.uses) continue
    if (d.chanceBp < BP && sim.rng.int(BP) >= d.chanceBp) continue
    const hitIds: string[] = []
    const dodgedIds: string[] = []
    let fired = true
    switch (kind) {
      case 'invincible':
        m.invincibleUntil = sim.tick + msToTicks(cfg, d.durationMs)
        break
      case 'fullHeal':
        m.hp = m.maxHp
        break
      case 'groupHeal':
        for (const o of sim.monsters) if (o.hp > 0) o.hp = Math.min(o.maxHp, o.hp + applyBp(o.maxHp, GROUP_HEAL_BP))
        break
      case 'haste':
        m.hasteUntil = sim.tick + msToTicks(cfg, d.durationMs)
        break
      case 'blink': {
        // 출구 바로 앞 칸 가운데까지만 (순간이동으로 바로 목숨이 깎이지 않게)
        const to = Math.min(m.dist + BLINK_CELLS * CELL, map.length - CELL / 2)
        if (to <= m.dist) fired = false
        else m.dist = m.prevDist = to
        break
      }
      case 'freeze': {
        const mc = map.path[pathIndexAt(map, m.dist)]!
        const immune = msToTicks(cfg, FREEZE_IMMUNE_MS)
        const targets = sim.units.filter((x) => sim.tick >= x.frozenUntil + immune && inRange(mc, x.cell, 1, 'square'))
        if (!targets.length) fired = false
        const until = sim.tick + msToTicks(cfg, d.durationMs)
        for (const x of targets) {
          if (dodges(sim, x, m)) dodgedIds.push(x.inst.id)
          else {
            x.frozenUntil = until
            hitIds.push(x.inst.id)
          }
        }
        break
      }
      case 'scatter': {
        const free = freeSlots(sim)
        if (!free.length) fired = false
        else if (dodges(sim, u, m)) dodgedIds.push(u.inst.id)
        else {
          u.cell = free[sim.rng.int(free.length)]!
          hitIds.push(u.inst.id)
        }
        break
      }
      case 'weaken':
        if (dodges(sim, u, m)) dodgedIds.push(u.inst.id)
        else {
          u.weakenedUntil = sim.tick + msToTicks(cfg, d.durationMs)
          hitIds.push(u.inst.id)
        }
        break
      case 'armorUp':
        m.armorUpUntil = sim.tick + msToTicks(cfg, d.durationMs)
        break
    }
    if (!fired) continue
    if (d.cooldownMs) m.abilityReadyAt[kind] = sim.tick + msToTicks(cfg, d.cooldownMs)
    if (d.uses) m.abilityUsed[kind] = (m.abilityUsed[kind] ?? 0) + 1
    sim.events.push({ type: 'mskill', kind, monsterId: m.id, dist: m.dist, unitIds: hitIds, dodgedIds })
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

const cellOfMonster = (sim: WaveSim, m: Monster) => sim.map.path[pathIndexAt(sim.map, m.dist)]!

/** 캐릭 특수능력 효과 (명중 판정 뒤). crit 은 피해 계산에서 이미 반영 */
function applyUnitAbility(sim: WaveSim, u: SimUnit, target: Monster, proc: Ability, atk: number) {
  const { cfg, map } = sim
  const blocked = (k: AbilityKind) => target.spec.immunities.includes(k) || isInvincible(sim, target)
  switch (proc.kind) {
    case 'stun':
      if (!blocked('stun') && sim.tick >= target.stunImmuneUntil && sim.tick >= target.stunnedUntil) {
        target.stunnedUntil = sim.tick + msToTicks(cfg, proc.durationMs)
        target.stunImmuneUntil = target.stunnedUntil + msToTicks(cfg, STUN_IMMUNE_MS)
      }
      break
    case 'splash': {
      // 맞힌 자리(대상 칸) 중심 3×3의 다른 몬스터 (명중 판정 없음)
      const tc = cellOfMonster(sim, target)
      for (const m of sim.monsters) {
        if (m === target || m.hp <= 0 || m.spec.immunities.includes('splash')) continue
        if (inRange(tc, cellOfMonster(sim, m), 1, 'square')) damage(sim, u, m, atk, false, true)
      }
      break
    }
    case 'recall':
      if (!blocked('recall') && target.hp > 0) {
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
    case 'allAttack':
      // 맵 위 다른 몬스터 전부 (광역공격처럼 명중 판정 없음, 몬스터 능력 판정은 원래 대상만)
      for (const m of sim.monsters) {
        if (m === target || m.hp <= 0 || m.spec.immunities.includes('allAttack')) continue
        damage(sim, u, m, atk, false, true)
      }
      break
    case 'teamLevel':
      sim.levelBuffs.push({ stat: proc.stat, level: proc.level, until: sim.tick + msToTicks(cfg, TEAM_LEVEL_MS) })
      break
    case 'crit':
      break
  }
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
      hasteUntil: 0,
      invincibleUntil: 0,
      abilityReadyAt: {},
      abilityUsed: {},
    })
  }

  // 이동 · 출구
  for (const m of sim.monsters) {
    m.prevDist = m.dist
    if (sim.tick < m.stunnedUntil) continue
    const o = obstacleAt(m)
    const slow = o?.kind === 'slow' ? OBSTACLE_SLOW_BP : 0
    const speed = sim.tick < m.hasteUntil ? m.speed * 2 : m.speed
    m.dist += Math.max(1, speed - applyBp(speed, slow))
    if (m.dist >= map.length) {
      m.hp = 0
      sim.lives -= m.spec.leak
      sim.leaked++
      sim.events.push({ type: 'leak', monsterId: m.id, lives: sim.lives })
    }
  }
  sim.monsters = sim.monsters.filter((m) => m.dist < map.length)

  // 가시 장애물: 1초마다
  if (sim.tick % cfg.tickRate === 0) {
    for (const m of sim.monsters) {
      const o = obstacleAt(m)
      if (o?.kind !== 'damage' || isInvincible(sim, m)) continue
      m.hp -= o.damage
      sim.events.push({ type: 'thorn', monsterId: m.id, dist: m.dist, amount: o.damage })
    }
  }

  // 공격: 사거리 안에서 가장 앞선(출구에 가까운) 몬스터
  //   게이지는 매 틱 공속만큼 참 (얼어 있어도 참, 약화 중엔 절반). 칠 대상이 없으면 한 대 분량에서 멈춤
  for (const u of sim.units) {
    const st = unitStats(sim, u.inst)
    const weak = sim.tick < u.weakenedUntil
    const full = sim.windowTicks * 2
    u.atkGauge += weak ? st.attackSpeed : st.attackSpeed * 2
    const ready = u.atkGauge >= full && sim.tick >= u.frozenUntil
    let target: Monster | null = null
    if (ready) {
      for (const m of sim.monsters) {
        if (m.hp <= 0) continue
        if (!inRange(u.cell, cellOf(m), st.range, cfg.rangeShape)) continue
        if (!target || m.dist > target.dist) target = m
      }
    }
    if (!target) {
      u.atkGauge = Math.min(u.atkGauge, full)
      continue
    }
    u.atkGauge -= full

    // 특수능력 (빗나가도 발동)
    const a = u.inst.ability
    const proc = rollProc(sim, u) ? a : null
    if (proc) sim.events.push({ type: 'proc', unitId: u.inst.id, kind: proc.kind, monsterId: target.id, dist: target.dist })

    const hitBp = agilityChanceBp(st.agility, target.spec.agility)
    const hit = sim.rng.int(BP) < (weak ? Math.floor(hitBp / 2) : hitBp)
    if (hit) damage(sim, u, target, st.atk, proc?.kind === 'crit', false)
    else sim.events.push({ type: 'miss', unitId: u.inst.id, monsterId: target.id, dist: target.dist })

    if (proc) applyUnitAbility(sim, u, target, proc, st.atk)
    // 맞은 몬스터의 능력 (빗나가도)
    monsterReact(sim, u, target)
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
