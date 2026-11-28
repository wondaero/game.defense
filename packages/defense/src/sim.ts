import {
  ABILITY_COOLDOWN_MS,
  AGI_COPY_MS,
  FRENZY_MS,
  ICE_TILE_MS,
  LULLABY_MS,
  LULLABY_WAKE_HITS,
  HYPNOSIS_CELLS,
  RESIST_POWER,
  levelBonus,
  SPLASH_RADIUS,
  STUN_IMMUNE_MS,
  TEAM_LEVEL_MS,
  type Ability,
  type AbilityKind,
  type BuffStat,
  type ObstacleKind,
} from './abilities.ts'
import { applyBp, ATTACK_WINDOW_MS, BP, MAX_ATTACK_SPEED, msToTicks, type DefenseConfig } from './config.ts'
import { CELL, inRange, pathIndexAt, pierceLine, type Cell, type GameMap } from './map.ts'
import { Rng, seedFromString } from './rng.ts'
import { baseStats, type UnitInstance } from './roster.ts'
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
  /** 맹독: 1초마다 받는 피해 (0 = 안 걸림). 몬스터당 한 번, 죽을 때까지 */
  poisonDmg: number
  /** 이미 밟은 가시 장애물 (길 칸 번호) — 가시는 몬스터마다 한 번만 */
  thornHit: number[]
  /** 최면: 아직 뒤로 가야 할 거리 (0 = 앞으로 감) */
  hypnoLeft: number
  /** 최면에 걸린 적 있음 (몬스터당 한 번) */
  hypnotized: boolean
  /** 빙결로 멈춤 (그림용 — 실제 멈춤은 stunnedUntil) */
  iceUntil: number
  /** 자장가: 이 틱까지 잠듦 (못 움직임) / 잠든 뒤 맞은 수 */
  sleepUntil: number
  sleepHits: number
  /** 흡수: 이 틱까지 받는 피해가 체력으로 */
  absorbUntil: number
  /** 민첩 빼앗기: 이 틱까지 뺏은 민첩을 더함 */
  stolenAgi: number
  stolenUntil: number
  /** 분열로 나온 쪽 (능력 없음) */
  isClone: boolean
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
  /** 이 틱까지 봉인 — 특수능력 발동 안 됨, 강화 효과 꺼짐 (몬스터 "봉인") */
  sealedUntil: number
  /** 이 틱까지 광폭화 (공속 2배 · 명중률 2배) */
  frenzyUntil: number
  /** 민첩 복사: 이 틱까지 agiCopy 만큼 민첩 + */
  agiCopy: number
  agiCopyUntil: number
  /** 몬스터 "민첩 빼앗기": 이 틱까지 민첩 1 */
  agiStolenUntil: number
}

export interface Obstacle {
  /** 길 칸 번호 (map.path 인덱스) */
  index: number
  kind: ObstacleKind
  /** 가시: 1초마다 밟은 몬스터 최대 체력의 % / 늪: 속도 감소 % (basis point) */
  amountBp: number
  ownerId: string
}

export type SimEvent =
  | { type: 'hit'; unitId: string; monsterId: number; dist: number; amount: number; crit: boolean; splash: boolean }
  | { type: 'miss'; unitId: string; monsterId: number; dist: number }
  | { type: 'proc'; unitId: string; kind: AbilityKind; monsterId: number; dist: number }
  | { type: 'thorn'; monsterId: number; dist: number; amount: number }
  | { type: 'poison'; monsterId: number; dist: number; amount: number }
  | { type: 'kill'; monsterId: number; monsterType: MonsterId; dist: number }
  | { type: 'leak'; monsterId: number; lives: number }
  /** 무적이라 피해가 안 들어감 */
  | { type: 'block'; unitId: string; monsterId: number; dist: number }
  /** 특수능력이 발동했지만 몬스터가 민첩으로 버팀 */
  | { type: 'resist'; unitId: string; monsterId: number; dist: number; kind: AbilityKind }
  /** 왕이라 안 통함 (즉사) */
  | { type: 'immune'; unitId: string; monsterId: number; dist: number; kind: AbilityKind }
  /** 흡수: 피해가 체력으로 */
  | { type: 'heal'; monsterId: number; dist: number; amount: number }
  /** 몬스터 능력 발동. unitIds = 걸린 캐릭, dodgedIds = 민첩으로 피한 캐릭 */
  | { type: 'mskill'; kind: MonsterAbilityKind; monsterId: number; dist: number; unitIds: string[]; dodgedIds: string[] }

export interface WaveSim {
  cfg: DefenseConfig
  map: GameMap
  stage: StageDef
  rng: Rng
  /** 이 판의 씨앗 (0 = 탄 번호만) */
  playSeed: number
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
  /** 왕(우두머리)이 통과함 → 바로 실패 (2026-11-27) */
  bossLeaked: boolean
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
  /**
   * 판 씨앗: 판(도전)마다 새로 정함 → 같은 탄을 다시 해도 명중·특수능력 발동·장애물 자리가 달라짐 (2026-11-27).
   * 0 = 탄 번호만 씀 (체력 보정·테스트용 고정). 서버 검증 땐 이 값도 같이 받아 다시 돌림.
   */
  playSeed = 0,
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
    .map((inst) => ({ inst, cell: { ...placements[inst.id]! }, atkGauge: windowTicks * 2, weakenedUntil: 0, abilityReadyAt: 0, obstacleUsed: false, frozenUntil: -1_000_000, sealedUntil: 0, frenzyUntil: 0, agiCopy: 0, agiCopyUntil: 0, agiStolenUntil: 0 }))
    .sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x)
  return {
    cfg,
    map,
    stage,
    rng: new Rng({ s: playSeed ? seedFromString(`${stage.seed}:${playSeed >>> 0}`) : stage.seed }),
    playSeed: playSeed >>> 0,
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
    bossLeaked: false,
    nextMonsterId: 1,
    windowTicks,
    events: [],
    done: false,
  }
}

/** 레벨업 버프를 반영한 능력치 */
export function unitStats(sim: WaveSim, inst: UnitInstance, sealed = false) {
  // 강화 특수능력이면 올라간 능력치에서 시작 (봉인 중엔 원래 값)
  let { atk, range, attackSpeed, agility } = baseStats(sim.cfg, inst, sealed)
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

/** 지금 몬스터 민첩 (민첩 빼앗기 반영). 명중·몬스터 기술 피하기·저항 모두 이 값 */
export const monsterAgility = (sim: WaveSim, m: Monster) => m.spec.agility + (sim.tick < m.stolenUntil ? m.stolenAgi : 0)

/**
 * 몬스터 체력 깎기 (방어 계산 끝난 값). 흡수 중이면 체력으로 (최대 체력까지).
 * 반환: 실제로 깎였으면 true
 */
function hurt(sim: WaveSim, m: Monster, dmg: number): boolean {
  if (sim.tick < m.absorbUntil) {
    const heal = Math.min(dmg, m.maxHp - m.hp)
    m.hp += heal
    sim.events.push({ type: 'heal', monsterId: m.id, dist: m.dist, amount: heal })
    return false
  }
  m.hp -= dmg
  return true
}

/** 피해 주기. crit = 공격력×2 − 방어력. 무적이면 안 들어감. 잠든 몬스터는 LULLABY_WAKE_HITS 대 맞으면 깸 */
function damage(sim: WaveSim, u: SimUnit, m: Monster, atk: number, crit: boolean, splash: boolean) {
  if (isInvincible(sim, m)) {
    sim.events.push({ type: 'block', unitId: u.inst.id, monsterId: m.id, dist: m.dist })
    return
  }
  const armor = monsterArmor(sim, m)
  const dmg = Math.max(1, (crit ? atk * 2 : atk) - armor)
  if (hurt(sim, m, dmg)) sim.events.push({ type: 'hit', unitId: u.inst.id, monsterId: m.id, dist: m.dist, amount: dmg, crit, splash })
  if (sim.tick < m.sleepUntil && ++m.sleepHits >= LULLABY_WAKE_HITS) m.sleepUntil = 0
}

/** 캐릭이 몬스터 기술을 민첩으로 피하나 */
/** 판 위 캐릭의 지금 능력치: 봉인(강화 꺼짐) · 광폭화(공속·민첩 2배) 반영 */
export function unitStatsNow(sim: WaveSim, u: SimUnit) {
  const st = unitStats(sim, u.inst, sim.tick < u.sealedUntil)
  if (sim.tick < u.frenzyUntil) {
    // 광폭화 (2026-11-27): 공속 2배(한 틱 두 번은 안 치게 windowTicks 까지) · 민첩 2배
    st.attackSpeed = Math.min(sim.windowTicks, st.attackSpeed * 2)
    st.agility = st.agility * 2
  }
  // 민첩 복사 (2026-11-28): 몬스터 민첩을 더함. 민첩 빼앗기에 걸리면 1 (가장 나중)
  if (sim.tick < u.agiCopyUntil) st.agility += u.agiCopy
  if (sim.tick < u.agiStolenUntil) st.agility = 1
  return st
}

const dodges = (sim: WaveSim, u: SimUnit, m: Monster) => sim.rng.int(BP) < agilityChanceBp(unitStatsNow(sim, u).agility, monsterAgility(sim, m))

/** 새 몬스터 (출현·분열) */
function makeMonster(sim: WaveSim, type: MonsterId, spec: MonsterSpec, hp: number, maxHp: number, speed: number, dist: number): Monster {
  return {
    id: sim.nextMonsterId++,
    type,
    spec,
    hp,
    maxHp,
    speed,
    dist,
    prevDist: dist,
    stunnedUntil: 0,
    stunImmuneUntil: 0,
    armorUpUntil: 0,
    hasteUntil: 0,
    invincibleUntil: 0,
    poisonDmg: 0,
    thornHit: [],
    hypnoLeft: 0,
    hypnotized: false,
    iceUntil: 0,
    sleepUntil: 0,
    sleepHits: 0,
    absorbUntil: 0,
    stolenAgi: 0,
    stolenUntil: 0,
    isClone: false,
    abilityReadyAt: {},
    abilityUsed: {},
  }
}

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
        // 출구 바로 앞 칸 가운데까지만 (출구 칸 가운데 = 사라지는 곳)
        const to = Math.min(m.dist + BLINK_CELLS * CELL, map.length - CELL)
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
      case 'seal':
        if (dodges(sim, u, m)) dodgedIds.push(u.inst.id)
        else {
          u.sealedUntil = sim.tick + msToTicks(cfg, d.durationMs)
          hitIds.push(u.inst.id)
        }
        break
      case 'agiSteal':
        if (dodges(sim, u, m)) dodgedIds.push(u.inst.id)
        else {
          // 캐릭 민첩을 1로, 뺏은 만큼(지금 민첩 − 1) 몬스터 민첩에 +
          const until = sim.tick + msToTicks(cfg, d.durationMs)
          m.stolenAgi = Math.max(0, Math.floor(unitStatsNow(sim, u).agility) - 1)
          m.stolenUntil = until
          u.agiStolenUntil = until
          hitIds.push(u.inst.id)
        }
        break
      case 'absorb':
        m.absorbUntil = sim.tick + msToTicks(cfg, d.durationMs)
        break
      case 'split': {
        // 지금 체력을 반씩. 나온 쪽은 같은 종류·같은 자리, 능력 없음 (다시 분열 안 함)
        if (m.hp < 2) {
          fired = false
          break
        }
        const half = Math.floor(m.hp / 2)
        m.hp -= half
        const clone = makeMonster(sim, m.type, { ...m.spec, abilities: [] }, half, m.maxHp, m.speed, m.dist)
        clone.isClone = true
        sim.monsters.push(clone)
        break
      }
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
  if (!a || sim.tick < u.abilityReadyAt || sim.tick < u.sealedUntil || a.chanceBp <= 0) return false
  if (a.kind === 'obstacle' && u.obstacleUsed) return false
  // 시험용 확률 100% 여도 난수는 똑같이 한 번 씀 (켜고 끄는 것 말고는 결과 흐름이 같게)
  if (sim.rng.int(BP) >= (sim.cfg.forceProc ? BP : a.chanceBp)) return false
  const cd = a.kind === 'frenzy' ? a.cooldownMs : ABILITY_COOLDOWN_MS[a.kind]
  if (cd) u.abilityReadyAt = sim.tick + msToTicks(sim.cfg, cd)
  return true
}

const cellOfMonster = (sim: WaveSim, m: Monster) => sim.map.path[pathIndexAt(sim.map, m.dist)]!

/** 캐릭 특수능력 효과 (명중 판정 뒤). crit 은 피해 계산에서 이미 반영 */
function applyUnitAbility(sim: WaveSim, u: SimUnit, target: Monster, proc: Ability, atk: number) {
  const { cfg, map } = sim
  const blocked = (k: AbilityKind) => target.spec.immunities.includes(k) || isInvincible(sim, target)
  // 저항: 걸릴 수 있는 상태일 때만 굴림 (마지막에 호출). 걸릴 확률 = 20 / (20 + 몬스터 민첩)
  const lands = (m: Monster = target) => {
    if (sim.rng.int(BP) < agilityChanceBp(RESIST_POWER, monsterAgility(sim, m))) return true
    sim.events.push({ type: 'resist', unitId: u.inst.id, monsterId: m.id, dist: m.dist, kind: proc.kind })
    return false
  }
  switch (proc.kind) {
    case 'stun':
      if (!blocked('stun') && sim.tick >= target.stunImmuneUntil && sim.tick >= target.stunnedUntil && lands()) {
        target.stunnedUntil = sim.tick + msToTicks(cfg, proc.durationMs)
        target.stunImmuneUntil = target.stunnedUntil + msToTicks(cfg, STUN_IMMUNE_MS)
      }
      break
    case 'splash': {
      // 맞힌 자리(대상 칸) 중심 5×5의 다른 몬스터 (명중 판정 없음)
      const tc = cellOfMonster(sim, target)
      for (const m of sim.monsters) {
        if (m === target || m.hp <= 0 || m.spec.immunities.includes('splash')) continue
        if (inRange(tc, cellOfMonster(sim, m), SPLASH_RADIUS, 'square')) damage(sim, u, m, atk, false, true)
      }
      break
    }
    case 'recall':
      if (!blocked('recall') && target.hp > 0 && lands()) {
        target.dist = 0
        target.prevDist = 0
      }
      break
    case 'obstacle': {
      // count 개(1/2)를 서로 다른 빈 칸에 (칸 중첩 없음)
      for (let c = 0; c < (proc.count ?? 1); c++) {
        const free = map.path.map((_, i) => i).filter((i) => !sim.obstacles.some((o) => o.index === i))
        if (!free.length) break
        const index = free[sim.rng.int(free.length)]!
        sim.obstacles.push({ index, kind: proc.obstacle, amountBp: proc.amountBp, ownerId: u.inst.id })
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
    case 'hypnosis':
      // 몬스터당 한 번. 출발지보다 뒤로는 안 감
      if (!blocked('hypnosis') && !target.hypnotized && target.hp > 0 && lands()) {
        target.hypnotized = true
        target.hypnoLeft = Math.min(HYPNOSIS_CELLS * CELL, target.dist)
      }
      break
    case 'frenzy':
      u.frenzyUntil = sim.tick + msToTicks(cfg, FRENZY_MS)
      break
    case 'poison':
      // 빗나가도 걸림 (다른 특수능력과 같음). 이미 걸렸으면 그대로 (중첩 없음)
      if (!blocked('poison') && target.poisonDmg === 0 && target.hp > 0 && lands()) target.poisonDmg = Math.max(1, applyBp(atk, proc.pctBp))
      break
    case 'instakill':
      // 왕에겐 안 통함 (2026-11-28)
      if (target.spec.id === 'boss') sim.events.push({ type: 'immune', unitId: u.inst.id, monsterId: target.id, dist: target.dist, kind: 'instakill' })
      else if (!blocked('instakill') && target.hp > 0 && lands()) target.hp = 0
      break
    case 'iceTile': {
      // 때린 몬스터가 있는 길 1칸의 몬스터 모두 멈춤. 스턴과 같은 규칙 (스턴 중·면역 중이면 안 걸림)
      const idx = pathIndexAt(map, target.dist)
      for (const m of sim.monsters) {
        if (m.hp <= 0 || pathIndexAt(map, m.dist) !== idx || m.spec.immunities.includes('iceTile') || isInvincible(sim, m)) continue
        if (sim.tick < m.stunImmuneUntil || sim.tick < m.stunnedUntil || !lands(m)) continue
        m.stunnedUntil = m.iceUntil = sim.tick + msToTicks(cfg, ICE_TILE_MS)
        m.stunImmuneUntil = m.stunnedUntil + msToTicks(cfg, STUN_IMMUNE_MS)
      }
      break
    }
    case 'lullaby':
      // 판 위 몬스터 모두 잠듦 (왕 포함, 몬스터마다 저항)
      for (const m of sim.monsters) {
        if (m.hp <= 0 || m.spec.immunities.includes('lullaby') || isInvincible(sim, m) || !lands(m)) continue
        m.sleepUntil = sim.tick + msToTicks(cfg, LULLABY_MS)
        m.sleepHits = 0
      }
      break
    case 'pierce': {
      // 캐릭 → 맞힌 칸 방향으로 길이 곧게 이어지는 칸들 (map.ts pierceLine)
      const line = new Set(pierceLine(map, u.cell, cellOfMonster(sim, target)).map((c) => c.y * 1000 + c.x))
      const st = unitStatsNow(sim, u)
      const weak = sim.tick < u.weakenedUntil
      for (const m of sim.monsters) {
        if (m === target || m.hp <= 0 || m.spec.immunities.includes('pierce')) continue
        const c = cellOfMonster(sim, m)
        if (!line.has(c.y * 1000 + c.x)) continue
        // 슬라임마다 명중 판정 (평타와 같은 규칙, 약화 중이면 절반)
        const hitBp = agilityChanceBp(st.agility, monsterAgility(sim, m))
        if (sim.rng.int(BP) < (weak ? Math.floor(hitBp / 2) : hitBp)) damage(sim, u, m, atk, false, true)
      }
      break
    }
    case 'agiCopy':
      u.agiCopy = Math.floor(monsterAgility(sim, target))
      u.agiCopyUntil = sim.tick + msToTicks(cfg, AGI_COPY_MS)
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
    sim.monsters.push(makeMonster(sim, s.type, spec, hp, hp, speed, 0))
  }

  // 이동 · 출구
  for (const m of sim.monsters) {
    m.prevDist = m.dist
    if (sim.tick < m.stunnedUntil || sim.tick < m.sleepUntil) continue
    const o = obstacleAt(m)
    const slow = o?.kind === 'slow' ? o.amountBp : 0
    const speed = sim.tick < m.hasteUntil ? m.speed * 2 : m.speed
    const step = Math.max(1, speed - applyBp(speed, slow))
    if (m.hypnoLeft > 0) {
      // 최면: 뒤로 걸어감 → 다 가면 다시 앞으로
      const back = Math.min(step, m.hypnoLeft, m.dist)
      m.dist -= back
      m.hypnoLeft = m.dist > 0 ? m.hypnoLeft - back : 0
      continue
    }
    m.dist += step
    if (m.dist >= map.length) {
      m.hp = 0
      // 몬스터 한 마리 = 1. 단 왕(우두머리)은 통과하면 바로 실패 (2026-11-27)
      sim.lives -= 1
      if (m.spec.id === 'boss') {
        sim.lives = 0
        sim.bossLeaked = true
      }
      sim.leaked++
      sim.events.push({ type: 'leak', monsterId: m.id, lives: sim.lives })
    }
  }
  sim.monsters = sim.monsters.filter((m) => m.dist < map.length)

  // 가시 장애물: 처음 밟는 순간 한 번만 최대 체력의 % (방어 무시). 그 몬스터는 다시 밟아도 안 깎임 (2026-11-27)
  for (const m of sim.monsters) {
    const o = obstacleAt(m)
    if (o?.kind !== 'damage' || m.thornHit.includes(o.index)) continue
    m.thornHit.push(o.index)
    if (isInvincible(sim, m)) continue
    const dmg = Math.max(1, applyBp(m.maxHp, o.amountBp))
    if (hurt(sim, m, dmg)) sim.events.push({ type: 'thorn', monsterId: m.id, dist: m.dist, amount: dmg })
  }

  // 1초마다: 맹독 (방어 무시, 무적이면 안 들어감)
  if (sim.tick % cfg.tickRate === 0) {
    for (const m of sim.monsters) {
      if (isInvincible(sim, m)) continue
      if (m.poisonDmg > 0 && hurt(sim, m, m.poisonDmg)) sim.events.push({ type: 'poison', monsterId: m.id, dist: m.dist, amount: m.poisonDmg })
    }
  }

  // 공격: 사거리 안에서 가장 앞선(출구에 가까운) 몬스터
  //   게이지는 매 틱 공속만큼 참 (얼어 있어도 참, 약화 중엔 절반). 칠 대상이 없으면 한 대 분량에서 멈춤
  for (const u of sim.units) {
    const st = unitStatsNow(sim, u)
    const weak = sim.tick < u.weakenedUntil
    const speed = st.attackSpeed
    const full = sim.windowTicks * 2
    u.atkGauge += weak ? speed : speed * 2
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

    const hitBp = agilityChanceBp(st.agility, monsterAgility(sim, target))
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
  /** 별 0~3 */
  stars: number
}

/** 화면 없이 끝까지 (테스트·나중에 서버 검증용) */
export function runWave(sim: WaveSim, maxTicks = 200_000): WaveResult {
  while (!sim.done && sim.tick < maxTicks) stepWave(sim)
  return { ticks: sim.tick, lives: sim.lives, killed: sim.killed, leaked: sim.leaked, cleared: sim.lives > 0, stars: starsFor(sim.lives > 0, sim.leaked) }
}

/** 별 (2026-11-27): 통과 0마리 = 3개 · 1마리 = 2개 · 2마리 = 1개 · 실패(3마리째 통과) = 0 */
export function starsFor(cleared: boolean, leaked: number): number {
  return cleared ? Math.max(1, 3 - leaked) : 0
}
