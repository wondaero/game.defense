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

/** 브라우저 난수 (서버라면 서버가 굴림) */
const freshRng = () => new Rng(createRngState(crypto.getRandomValues(new Uint32Array(1))[0]!))

/** 시험용 막사: 씨앗으로 rosterSize 명을 뽑음 — 개발자 탭 "막사 다시 뽑기" 에서만 씀 (처음 계정은 빈 막사) */
export const testUnits = (cfg: DefenseConfig, seed: string) => rollRoster(cfg, createRngState(seed)).units

export function createLocalApi(getCfg: () => DefenseConfig, getUnlockAll: () => boolean): GameApi {
  const read = (): Account => {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY)
      // 예전 저장엔 없던 칸은 기본값으로
      if (raw) return { ...newAccount(), ...(JSON.parse(raw) as Partial<Account>) }
    } catch {
      /* 깨진 저장은 새로 */
    }
    // 처음 들어온 기기 (2026-11-28): 빈 막사 + 처음 지급 티켓만 (START_TICKETS). 캐릭은 뽑기 티켓으로 직접 뽑음
    // (예전엔 시험용 100명을 미리 넣어 줬음 — 개발자 탭 "막사 다시 뽑기"로 여전히 받을 수 있음)
    const acc = newAccount()
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
      const { account, value } = take(judgeStage(getCfg(), read(), { stageNo, placements, seed: run.seed }, freshRng(), getUnlockAll()))
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
      async resetAll() {
        const next = newAccount()
        write(next)
        runs.clear()
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
