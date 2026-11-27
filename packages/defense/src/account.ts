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
} from './barracks.ts'
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
}

export function newAccount(units: UnitInstance[] = []): Account {
  return { units, tickets: { ...START_TICKETS }, nextUnitId: units.length + 1, best: 0, stars: {} }
}

export type StatGrade = 'statNormal' | 'statHigh' | 'statTop'

/** 막사 요청 — 캐릭은 id 로만 가리킴 (화면이 보낸 캐릭 내용은 믿지 않음) */
export type BarracksAction =
  | { type: 'draw' }
  | { type: 'rerollStats'; unitId: string; grade: StatGrade; keep: StatKey[] }
  | { type: 'rerollAbility'; unitId: string }
  | { type: 'merge'; unitIds: string[] }

export type BarracksOutcome =
  | { type: 'drawn'; unit: UnitInstance }
  | { type: 'changed'; before: UnitInstance; after: UnitInstance; used: TicketKind; gainedAbility: boolean }
  | { type: 'merged'; count: number; reward: TicketKind }

export type Answer<T> = { ok: true; account: Account; value: T } | { ok: false; error: string }

const fail = (error: string) => ({ ok: false as const, error })

/** 막사 요청 처리 (검사 → 권 쓰기 → 결과). 계정은 고치지 않고 새 계정을 돌려줌 */
export function applyBarracks(cfg: DefenseConfig, acc: Account, action: BarracksAction, rng: Rng): Answer<BarracksOutcome> {
  const unit = (id: string) => acc.units.find((u) => u.id === id)
  const spend = (k: TicketKind): Tickets => ({ ...acc.tickets, [k]: acc.tickets[k] - 1 })
  switch (action.type) {
    case 'draw': {
      if (acc.tickets.draw < 1) return fail('뽑기권이 없어요')
      if (barracksFull(cfg, acc.units)) return fail(`막사가 꽉 찼어요 (${cfg.rosterSize}명). 합성으로 자리를 비워 주세요`)
      const u = drawUnit(cfg, rng, `u${acc.nextUnitId}`)
      return { ok: true, account: { ...acc, units: [...acc.units, u], tickets: spend('draw'), nextUnitId: acc.nextUnitId + 1 }, value: { type: 'drawn', unit: u } }
    }
    case 'rerollStats': {
      const u = unit(action.unitId)
      if (!u) return fail('없는 캐릭이에요')
      if (!(action.grade in STAT_TICKET_KEEP)) return fail('잘못된 변경권')
      if (acc.tickets[action.grade] < 1) return fail(`${TICKET_NAMES[action.grade]}이 없어요`)
      const keep = [...new Set(action.keep)]
      if (keep.length !== STAT_TICKET_KEEP[action.grade]) return fail(`유지할 능력치를 ${STAT_TICKET_KEEP[action.grade]}개 골라 주세요`)
      const after = rerollStats(cfg, rng, u, keep)
      return {
        ok: true,
        account: { ...acc, units: acc.units.map((x) => (x.id === u.id ? after : x)), tickets: spend(action.grade) },
        value: { type: 'changed', before: u, after, used: action.grade, gainedAbility: !u.ability && !!after.ability },
      }
    }
    case 'rerollAbility': {
      const u = unit(action.unitId)
      if (!u) return fail('없는 캐릭이에요')
      if (acc.tickets.ability < 1) return fail('특수능력 변경권이 없어요')
      const after = rerollAbility(rng, u)
      if (!after) return fail('특수능력이 없는 캐릭엔 못 써요')
      return {
        ok: true,
        account: { ...acc, units: acc.units.map((x) => (x.id === u.id ? after : x)), tickets: spend('ability') },
        value: { type: 'changed', before: u, after, used: 'ability', gainedAbility: false },
      }
    }
    case 'merge': {
      const ids = [...new Set(action.unitIds)]
      if (ids.some((id) => !unit(id))) return fail('없는 캐릭이 섞여 있어요')
      const reward = mergeReward(rng, ids.length)
      if (!reward) return fail('3·5·8·10·12명만 합성할 수 있어요')
      return {
        ok: true,
        account: { ...acc, units: acc.units.filter((u) => !ids.includes(u.id)), tickets: { ...acc.tickets, [reward]: acc.tickets[reward] + 1 } },
        value: { type: 'merged', count: ids.length, reward },
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

export type StageJudgement = WaveResult & { bossLeaked: boolean; newBest: boolean }

/**
 * 탄 결과 판정: 화면이 보낸 건 탄 번호 + 배치 + 씨앗뿐. 같은 엔진으로 처음부터 다시 돌려 결과를 정함.
 * skipOpenCheck = 시험판 "모든 탄 열기" 용 (서버엔 없음)
 */
export function judgeStage(cfg: DefenseConfig, acc: Account, rep: StageReport, skipOpenCheck = false): Answer<StageJudgement> {
  if (!skipOpenCheck && !stageOpen(acc, rep.stageNo)) return fail('아직 열리지 않은 탄이에요')
  const ids = Object.keys(rep.placements)
  if (ids.length === 0) return fail('캐릭을 한 명 이상 배치해 주세요')
  if (ids.length > cfg.maxDeploy) return fail(`최대 ${cfg.maxDeploy}명까지 출전할 수 있어요`)
  if (ids.some((id) => !acc.units.some((u) => u.id === id))) return fail('없는 캐릭이 배치돼 있어요')
  const stage = stageDef(rep.stageNo)
  const map = parseMap(MAP_DEFS.find((m) => m.id === stage.mapId)!)
  const cells = Object.values(rep.placements)
  if (cells.some((c) => map.tiles[c.y]?.[c.x] !== 'slot')) return fail('배치할 수 없는 칸이에요')
  if (new Set(cells.map((c) => `${c.x},${c.y}`)).size !== cells.length) return fail('한 칸에 한 명만 놓을 수 있어요')
  const sim = createWave(cfg, map, stage, acc.units, rep.placements, cfg.startLives, rep.seed)
  const r = runWave(sim)
  const n = rep.stageNo
  const next: Account = r.cleared ? { ...acc, best: Math.max(acc.best, n), stars: { ...acc.stars, [n]: Math.max(acc.stars[n] ?? 0, r.stars) } } : acc
  return { ok: true, account: next, value: { ...r, bossLeaked: sim.bossLeaked, newBest: r.cleared && n > acc.best } }
}
