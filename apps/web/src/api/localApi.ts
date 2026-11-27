import {
  applyBarracks,
  createRngState,
  judgeStage,
  newAccount,
  Rng,
  rollRoster,
  type Account,
  type Answer,
  type DefenseConfig,
} from '@def/defense'
import { ApiError, type GameApi } from './api.ts'

/**
 * 시험판 창구: 서버 대신 브라우저 안에서 엔진(account.ts)을 돌리고 localStorage 에 저장.
 * 서버를 붙이면 같은 GameApi 모양의 serverApi 로 바꾸기만 하면 됨.
 */
const ACCOUNT_KEY = 'defense.account.v1'
/** 예전 저장 (캐릭·권·기록이 화면 저장에 같이 있던 때) */
const OLD_SAVE_KEY = 'defense.save.v1'

/** 브라우저 난수 (서버라면 서버가 굴림) */
const freshRng = () => new Rng(createRngState(crypto.getRandomValues(new Uint32Array(1))[0]!))

/** 시험판 막사: 씨앗으로 rosterSize 명을 뽑아 둠 (진짜 게임은 빈 막사 + 첫 지급 권으로 시작) */
export const testUnits = (cfg: DefenseConfig, seed: string) => rollRoster(cfg, createRngState(seed)).units

export function createLocalApi(getCfg: () => DefenseConfig, getUnlockAll: () => boolean): GameApi {
  const read = (): Account => {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY)
      if (raw) return JSON.parse(raw) as Account
    } catch {
      /* 깨진 저장은 새로 */
    }
    // 처음: 예전 저장이 있으면 옮겨 옴 (캐릭은 같은 씨앗으로 만들어 원래 그대로)
    let old: Partial<Account> & { rosterSeed?: string } = {}
    try {
      old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY) ?? '{}')
    } catch {
      old = {}
    }
    const units = old.units ?? testUnits(getCfg(), old.rosterSeed ?? '시험판-1')
    const acc = { ...newAccount(units), ...(old.tickets ? { tickets: old.tickets } : {}), nextUnitId: old.nextUnitId ?? units.length + 1, best: old.best ?? 0, stars: old.stars ?? {} }
    write(acc)
    return acc
  }
  const write = (acc: Account) => localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc))
  const take = <T>(a: Answer<T>): { account: Account; value: T } => {
    if (!a.ok) throw new ApiError(a.error)
    write(a.account)
    return { account: a.account, value: a.value }
  }
  // 탄 시작 때 준 씨앗 (서버라면 서버가 기억)
  const runs = new Map<string, { stageNo: number; seed: number }>()

  return {
    async loadAccount() {
      return read()
    },
    async barracks(action) {
      const { account, value } = take(applyBarracks(getCfg(), read(), action, freshRng()))
      return { account, outcome: value }
    },
    async startStage(stageNo) {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]! || 1
      const runId = `${Date.now()}-${seed}`
      runs.set(runId, { stageNo, seed })
      return { runId, seed }
    },
    async finishStage({ runId, stageNo, placements }) {
      const run = runs.get(runId)
      if (!run || run.stageNo !== stageNo) throw new ApiError('시작하지 않은 탄이에요')
      runs.delete(runId)
      const { account, value } = take(judgeStage(getCfg(), read(), { stageNo, placements, seed: run.seed }, getUnlockAll()))
      return { account, result: value }
    },
    dev: {
      get unlockAll() {
        return getUnlockAll()
      },
      async grantTickets(n) {
        const a = read()
        const tickets = Object.fromEntries(Object.entries(a.tickets).map(([k, v]) => [k, v + n])) as Account['tickets']
        const next = { ...a, tickets }
        write(next)
        return next
      },
      async resetBarracks(seed) {
        const a = read()
        const units = testUnits(getCfg(), seed)
        const next = { ...a, units, nextUnitId: units.length + 1 }
        write(next)
        return next
      },
      async setBest(best) {
        const next = { ...read(), best }
        write(next)
        return next
      },
    },
  }
}
