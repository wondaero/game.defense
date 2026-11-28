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
import { ApiError, type DevSnapshot, type GameApi } from './api.ts'

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

/** 개발자 상태 저장 슬롯 (2026-11-28): 계정 + 화면 저장(맵별 배치)을 문자열 그대로 보관, 최대 SNAP_MAX 개 */
const SAVE_KEY = 'defense.save.v1'
const SNAP_KEY = 'defense.devSnapshots.v1'
const SNAP_MAX = 10
type StoredSnap = DevSnapshot & { data: { account: string | null; save: string | null } }
function readSnaps(): StoredSnap[] {
  try {
    return JSON.parse(localStorage.getItem(SNAP_KEY) ?? '[]') as StoredSnap[]
  } catch {
    return []
  }
}

export function createLocalApi(getCfg: () => DefenseConfig, getUnlockAll: () => boolean): GameApi {
  const read = (): Account => {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY)
      // 예전 저장엔 없던 칸은 기본값으로
      if (raw) {
        const a = JSON.parse(raw) as Partial<Account>
        // 새로 생긴 티켓 종류(특수능력 부여 등)는 0 으로 채움
        const zero = Object.fromEntries(Object.keys(newAccount().tickets).map((k) => [k, 0])) as Account['tickets']
        return { ...newAccount(), ...a, tickets: { ...zero, ...(a.tickets ?? newAccount().tickets) } }
      }
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
      if (!run || run.stageNo !== stageNo) throw new ApiError('시작하지 않은 탄이에요.')
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
      snapshots() {
        return readSnaps().map(({ data: _d, ...meta }) => meta)
      },
      saveSnapshot(name) {
        const a = read()
        const snap = {
          id: `${Date.now()}`,
          name,
          at: new Date().toISOString(),
          summary: { units: a.units.length, best: a.best, gold: a.gold ?? 0, tickets: Object.values(a.tickets).reduce((n, v) => n + v, 0) },
          data: { account: localStorage.getItem(ACCOUNT_KEY), save: localStorage.getItem(SAVE_KEY) },
        }
        const list = [snap, ...readSnaps()].slice(0, SNAP_MAX)
        localStorage.setItem(SNAP_KEY, JSON.stringify(list))
        return list.map(({ data: _d, ...meta }) => meta)
      },
      loadSnapshot(id) {
        const s = readSnaps().find((x) => x.id === id)
        if (!s) throw new ApiError('없는 저장이에요.')
        if (s.data.account) localStorage.setItem(ACCOUNT_KEY, s.data.account)
        else localStorage.removeItem(ACCOUNT_KEY)
        if (s.data.save) localStorage.setItem(SAVE_KEY, s.data.save)
        else localStorage.removeItem(SAVE_KEY)
        runs.clear()
      },
      deleteSnapshot(id) {
        const list = readSnaps().filter((x) => x.id !== id)
        localStorage.setItem(SNAP_KEY, JSON.stringify(list))
        return list.map(({ data: _d, ...meta }) => meta)
      },
      async setBest(best) {
        const next = { ...read(), best }
        write(next)
        return next
      },
    },
  }
}
