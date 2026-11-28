import {
  barracksFull,
  drawUnit,
  mergeReward,
  rerollAbility,
  rerollStats,
  START_TICKETS,
  STAT_TICKET_KEEP,
  TICKET_NAMES,
  type StatKey,
  type TicketKind,
  type Tickets,
  MERGE_COST,
  mergeRewards,
} from './barracks.ts'
import { rollAbility } from './abilities.ts'
import type { DefenseConfig } from './config.ts'
import { parseMap } from './map.ts'
import { MAP_DEFS } from './maps.ts'
import type { Rng } from './rng.ts'
import type { UnitInstance } from './roster.ts'
import { createWave, runWave, type Placements, type WaveResult } from './sim.ts'
import { LAST_NORMAL_STAGE, stageDef } from './stages.ts'

/**
 * 계정 = 서버가 지키는 것 (2026-11-27, design.md 7장).
 * 화면은 계정을 직접 고치지 않고 "요청(action)"만 보냄 → 이 파일의 함수가 검사하고 결과를 돌려줌.
 * 지금은 브라우저(apps/web/src/api/localApi.ts)가 이 함수를 돌리고, 서버를 붙이면 서버가 같은 함수를 돌림.
 * 난수(Rng)는 부르는 쪽이 줌: 시험판 = 브라우저, 진짜 = 서버 (앱에서 굴리면 조작 가능)
 */
export interface Account {
  units: UnitInstance[]
  tickets: Tickets
  /** 다음 캐릭 번호 (u1, u2, …) */
  nextUnitId: number
  /** 최고 기록 (깬 탄) */
  best: number
  /** 탄별 가장 좋은 별 1~3 */
  stars: Record<number, number>
  /** 화폐 (이름 *임시* 골드) — 탄을 깨면 얻음, 상점에서 씀 */
  gold: number
}

export function newAccount(units: UnitInstance[] = []): Account {
  return { units, tickets: { ...START_TICKETS }, nextUnitId: units.length + 1, best: 0, stars: {}, gold: 0 }
}

export type StatGrade = 'statNormal' | 'statHigh' | 'statTop'

/** 막사 요청 — 캐릭은 id 로만 가리킴 (화면이 보낸 캐릭 내용은 믿지 않음) */
/** 병사 뽑기 덤: 뽑을 때마다 이 확률로 능력치 변경 티켓(보통) +1 (2026-11-29 사용자, 1%) */
export const DRAW_BONUS_BP = 100

export type BarracksAction =
  | { type: 'draw' }
  /** 모두 뽑기 (2026-11-29): 뽑기 티켓을 막사 자리가 허락하는 만큼 한 번에 */
  | { type: 'drawAll' }
  | { type: 'rerollStats'; unitId: string; grade: StatGrade; keep: StatKey[] }
  | { type: 'rerollAbility'; unitId: string }
  /** 특수능력 부여: 특수능력 없는 캐릭에 하나 붙임 (2026-11-28) */
  | { type: 'grantAbility'; unitId: string }
  /** 합성: 만들 권(target)을 고르고 그 필요 인원의 배수만큼 (2026-11-28) */
  | { type: 'merge'; unitIds: string[]; target: TicketKind }
  /** 상점에서 골드로 권 사기 (2026-11-28) */
  | { type: 'buy'; kind: TicketKind }

/**
 * 상점 값 (골드, 2026-11-28 *임시*). 합성 비율(능력치 보통 3명 · 뽑기 5명 · 상급 8명 · 특수능력 10명 · 최상급 12명)에 맞춰
 * "캐릭 1명 몫 = 100 골드" 로 매김 → 50탄 처음 ★★★(120) 약 4번 = 뽑기권 1장
 */
export const SHOP_PRICES: Readonly<Record<TicketKind, number>> = {
  statNormal: MERGE_COST.statNormal * 100,
  draw: MERGE_COST.draw * 100,
  statHigh: MERGE_COST.statHigh * 100,
  ability: MERGE_COST.ability * 100,
  statTop: MERGE_COST.statTop * 100,
  abilityGrant: MERGE_COST.abilityGrant * 100,
}

export type BarracksOutcome =
  /** bonus = 뽑기 덤으로 받은 능력치 변경 티켓(보통) 장 수 (2026-11-29, 뽑을 때마다 DRAW_BONUS_BP) */
  | { type: 'drawn'; unit: UnitInstance; bonus: number }
  | { type: 'drawnMany'; units: UnitInstance[]; bonus: number }
  | { type: 'changed'; before: UnitInstance; after: UnitInstance; used: TicketKind; gainedAbility: boolean }
  | { type: 'merged'; count: number; target: TicketKind; rewards: TicketKind[] }
  | { type: 'bought'; kind: TicketKind; price: number }

export type Answer<T> = { ok: true; account: Account; value: T } | { ok: false; error: string }

const fail = (error: string) => ({ ok: false as const, error })

/** 막사 요청 처리 (검사 → 권 쓰기 → 결과). 계정은 고치지 않고 새 계정을 돌려줌 */
export function applyBarracks(cfg: DefenseConfig, acc: Account, action: BarracksAction, rng: Rng): Answer<BarracksOutcome> {
  const unit = (id: string) => acc.units.find((u) => u.id === id)
  const spend = (k: TicketKind): Tickets => ({ ...acc.tickets, [k]: acc.tickets[k] - 1 })
  switch (action.type) {
    case 'draw': {
      if (acc.tickets.draw < 1) return fail('뽑기 티켓이 없어요.')
      if (barracksFull(cfg, acc.units)) return fail(`막사가 꽉 찼어요 (${cfg.rosterSize}명). 합성으로 자리를 비워 주세요.`)
      const u = drawUnit(cfg, rng, `u${acc.nextUnitId}`)
      const bonus = rng.int(10_000) < DRAW_BONUS_BP ? 1 : 0
      const tickets = { ...spend('draw'), statNormal: acc.tickets.statNormal + bonus }
      return { ok: true, account: { ...acc, units: [...acc.units, u], tickets, nextUnitId: acc.nextUnitId + 1 }, value: { type: 'drawn', unit: u, bonus } }
    }
    case 'drawAll': {
      const room = cfg.rosterSize - acc.units.length
      const n = Math.min(acc.tickets.draw, room)
      if (acc.tickets.draw < 1) return fail('뽑기 티켓이 없어요.')
      if (n < 1) return fail(`막사가 꽉 찼어요 (${cfg.rosterSize}명). 합성으로 자리를 비워 주세요.`)
      let bonus = 0
      const units = Array.from({ length: n }, (_, i) => {
        const u = drawUnit(cfg, rng, `u${acc.nextUnitId + i}`)
        if (rng.int(10_000) < DRAW_BONUS_BP) bonus++
        return u
      })
      return {
        ok: true,
        account: { ...acc, units: [...acc.units, ...units], tickets: { ...acc.tickets, draw: acc.tickets.draw - n, statNormal: acc.tickets.statNormal + bonus }, nextUnitId: acc.nextUnitId + n },
        value: { type: 'drawnMany', units, bonus },
      }
    }
    case 'rerollStats': {
      const u = unit(action.unitId)
      if (!u) return fail('없는 병사예요.')
      if (!(action.grade in STAT_TICKET_KEEP)) return fail('잘못된 변경 티켓이에요.')
      if (acc.tickets[action.grade] < 1) return fail(`${TICKET_NAMES[action.grade]}이 없어요.`)
      const keep = [...new Set(action.keep)]
      if (keep.length !== STAT_TICKET_KEEP[action.grade]) return fail(`유지할 능력치를 ${STAT_TICKET_KEEP[action.grade]}개 골라 주세요.`)
      const after = rerollStats(cfg, rng, u, keep)
      return {
        ok: true,
        account: { ...acc, units: acc.units.map((x) => (x.id === u.id ? after : x)), tickets: spend(action.grade) },
        value: { type: 'changed', before: u, after, used: action.grade, gainedAbility: !u.ability && !!after.ability },
      }
    }
    case 'rerollAbility': {
      const u = unit(action.unitId)
      if (!u) return fail('없는 병사예요.')
      if (acc.tickets.ability < 1) return fail('특수능력 변경 티켓이 없어요.')
      const after = rerollAbility(rng, u)
      if (!after) return fail('특수능력이 없는 병사엔 못 써요.')
      return {
        ok: true,
        account: { ...acc, units: acc.units.map((x) => (x.id === u.id ? after : x)), tickets: spend('ability') },
        value: { type: 'changed', before: u, after, used: 'ability', gainedAbility: false },
      }
    }
    case 'grantAbility': {
      const u = unit(action.unitId)
      if (!u) return fail('없는 병사예요.')
      if (u.ability) return fail('이미 특수능력이 있는 병사예요.')
      if ((acc.tickets.abilityGrant ?? 0) < 1) return fail('특수능력 부여 티켓이 없어요.')
      const after = { ...u, ability: rollAbility(rng) }
      return {
        ok: true,
        account: { ...acc, units: acc.units.map((x) => (x.id === u.id ? after : x)), tickets: spend('abilityGrant') },
        value: { type: 'changed', before: u, after, used: 'abilityGrant', gainedAbility: true },
      }
    }
    case 'buy': {
      const price = SHOP_PRICES[action.kind]
      if (price === undefined) return fail('파는 물건이 아니에요.')
      if ((acc.gold ?? 0) < price) return fail(`골드가 모자라요 (${price} 골드 필요).`)
      return {
        ok: true,
        account: { ...acc, gold: acc.gold - price, tickets: { ...acc.tickets, [action.kind]: acc.tickets[action.kind] + 1 } },
        value: { type: 'bought', kind: action.kind, price },
      }
    }
    case 'merge': {
      const ids = [...new Set(action.unitIds)]
      if (ids.some((id) => !unit(id))) return fail('없는 병사가 섞여 있어요.')
      const rewards = mergeRewards(rng, action.target, ids.length)
      if (!rewards) return fail(`${TICKET_NAMES[action.target] ?? '티켓'}은 ${MERGE_COST[action.target] ?? '?'}명 단위로 합성해요.`)
      const tickets = { ...acc.tickets }
      for (const k of rewards) tickets[k]++
      return {
        ok: true,
        account: { ...acc, units: acc.units.filter((u) => !ids.includes(u.id)), tickets },
        value: { type: 'merged', count: ids.length, target: action.target, rewards },
      }
    }
  }
}

/** 열린 탄인지: 다음 탄까지 (무한 탄은 101탄 이상 중 best + 1 까지) */
export function stageOpen(acc: Account, n: number): boolean {
  if (n < 1) return false
  if (n <= LAST_NORMAL_STAGE) return n <= acc.best + 1
  return acc.best >= LAST_NORMAL_STAGE && n <= Math.max(LAST_NORMAL_STAGE + 1, acc.best + 1)
}

export interface StageReport {
  stageNo: number
  placements: Placements
  /** 판 씨앗 — 탄 시작 때 (서버가) 정해 준 값 */
  seed: number
}

/**
 * 탄 보상 (2026-11-28 사용자 결정):
 * - 골드 = 기본 × 별 배율(★★★ 100% · ★★ 80% · ★ 50% · 실패 5%)
 * - 이미 깬 탄이면 그 1/10 (★★★ 다시 깸 10% · 실패 0.5%)
 * - 기본 = 2 × (10 + 탄 번호) (*임시*, 예전 "처음 깸" 금액과 같게) → 50탄 처음 ★★★ 120
 * - 처음 깬 탄은 + 낮은 확률로 권 1장 (어느 탄이든 같은 확률). 내림 (작은 탄의 실패는 0 일 수 있음)
 */
export const CURRENCY_NAME = '골드'
/** 기본 골드 = 처음 ★★★ 로 깼을 때 */
export const stageBaseGold = (n: number) => 2 * (10 + n)
/** 별 개수별 골드 배율 (basis point): [실패, ★, ★★, ★★★] */
export const STAR_GOLD_BP: readonly number[] = [500, 5000, 8000, 10_000]
/** 이미 깬 탄을 다시 할 때 나누는 수 */
export const REPLAY_GOLD_DIV = 10
/** 별 · 처음 여부에 따른 골드 (내림) */
export const stageGold = (n: number, stars = 3, replay = false) =>
  Math.floor((stageBaseGold(n) * STAR_GOLD_BP[Math.max(0, Math.min(3, stars))]!) / 10_000 / (replay ? REPLAY_GOLD_DIV : 1))
/** 처음 깬 탄에서 권이 나올 확률 — 별 개수별 (basis point): [실패, ★ 5%, ★★ 10%, ★★★ 15%] (2026-11-28) */
export const STAR_TICKET_BP: readonly number[] = [0, 500, 1000, 1500]
/** 우두머리 탄(10·20·30…)을 처음 깨면 골드 추가 (별 상관없이, 2026-11-28) */
export const BOSS_FIRST_CLEAR_GOLD = 100
/** 다시 깬 탄의 권 확률 = 처음의 1/이만큼 (2026-11-28) */
export const REPLAY_TICKET_DIV = 10
/** 권이 나오면 어떤 권인지 (합 10000) */
export const FIRST_CLEAR_TICKET_TABLE: readonly (readonly [TicketKind, number])[] = [
  ['draw', 5000],
  ['statNormal', 3500],
  ['ability', 1000],
  ['statHigh', 400],
  ['statTop', 100],
]
export interface StageReward {
  gold: number
  /** 그중 우두머리 첫 처치 보너스 */
  bossBonus: number
  ticket: TicketKind | null
  firstClear: boolean
}

function rollStageReward(acc: Account, n: number, cleared: boolean, stars: number, rng: Rng): StageReward {
  const replay = acc.stars[n]! > 0
  if (!cleared) return { gold: stageGold(n, 0, replay), bossBonus: 0, ticket: null, firstClear: false }
  const firstClear = !replay
  // 권: 별에 따라 처음 ★ 5% · ★★ 10% · ★★★ 15%, 다시 깬 탄은 1/10 — 어떤 권인지 비율은 같음 (2026-11-28)
  let ticket: TicketKind | null = null
  if (rng.int(firstClear ? 10_000 : 10_000 * REPLAY_TICKET_DIV) < STAR_TICKET_BP[Math.max(0, Math.min(3, stars))]!) {
    let r = rng.int(10_000)
    for (const [k, w] of FIRST_CLEAR_TICKET_TABLE) {
      if (r < w) {
        ticket = k
        break
      }
      r -= w
    }
  }
  const bossBonus = firstClear && n % 10 === 0 ? BOSS_FIRST_CLEAR_GOLD : 0
  return { gold: stageGold(n, stars, replay) + bossBonus, bossBonus, ticket, firstClear }
}

export type StageJudgement = WaveResult & { bossLeaked: boolean; newBest: boolean; reward: StageReward }

/**
 * 탄 결과 판정: 화면이 보낸 건 탄 번호 + 배치 + 씨앗뿐. 같은 엔진으로 처음부터 다시 돌려 결과를 정함.
 * rng = 보상 난수 (서버가 굴림). skipOpenCheck = 시험판 "모든 탄 열기" 용 (서버엔 없음)
 */
export function judgeStage(cfg: DefenseConfig, acc: Account, rep: StageReport, rng: Rng, skipOpenCheck = false): Answer<StageJudgement> {
  if (!skipOpenCheck && !stageOpen(acc, rep.stageNo)) return fail('아직 열리지 않은 탄이에요.')
  const ids = Object.keys(rep.placements)
  if (ids.length === 0) return fail('병사를 한 명 이상 배치해 주세요.')
  if (ids.length > cfg.maxDeploy) return fail(`최대 ${cfg.maxDeploy}명까지 출전할 수 있어요.`)
  if (ids.some((id) => !acc.units.some((u) => u.id === id))) return fail('없는 병사가 배치돼 있어요.')
  const stage = stageDef(rep.stageNo)
  const map = parseMap(MAP_DEFS.find((m) => m.id === stage.mapId)!)
  const cells = Object.values(rep.placements)
  if (cells.some((c) => map.tiles[c.y]?.[c.x] !== 'slot')) return fail('배치할 수 없는 칸이에요.')
  if (new Set(cells.map((c) => `${c.x},${c.y}`)).size !== cells.length) return fail('한 칸에 한 명만 놓을 수 있어요.')
  const sim = createWave(cfg, map, stage, acc.units, rep.placements, cfg.startLives, rep.seed)
  const r = runWave(sim)
  const n = rep.stageNo
  const reward = rollStageReward(acc, n, r.cleared, r.stars, rng)
  const next: Account = r.cleared
    ? {
        ...acc,
        best: Math.max(acc.best, n),
        stars: { ...acc.stars, [n]: Math.max(acc.stars[n] ?? 0, r.stars) },
        gold: (acc.gold ?? 0) + reward.gold,
        tickets: reward.ticket ? { ...acc.tickets, [reward.ticket]: acc.tickets[reward.ticket] + 1 } : acc.tickets,
      }
    : { ...acc, gold: (acc.gold ?? 0) + reward.gold } // 실패도 조금 (위로금)
  return { ok: true, account: next, value: { ...r, bossLeaked: sim.bossLeaked, newBest: r.cleared && n > acc.best, reward } }
}
