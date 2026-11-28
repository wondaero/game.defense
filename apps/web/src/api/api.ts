import type { Account, BarracksAction, BarracksOutcome, Placements, StageJudgement } from '@def/defense'

/**
 * 화면 ↔ 계정 창구 (2026-11-27).
 * 화면은 계정(캐릭·권·기록)을 직접 고치지 않고 이 창구로 요청만 보낸다.
 * - 지금: localApi (브라우저 안에서 엔진 account.ts 를 돌리고 localStorage 에 저장)
 * - 나중: serverApi (같은 모양으로 서버에 요청 → 서버가 account.ts 를 돌림). 화면 코드는 그대로
 * 모든 함수가 Promise 인 건 서버 요청과 모양을 맞추려고
 */
export interface GameApi {
  /** 내 계정 불러오기 */
  loadAccount(): Promise<Account>
  /** 막사 요청 (뽑기 · 능력치 변경 · 특수능력 변경 · 합성). 안 되면 ApiError */
  barracks(action: BarracksAction): Promise<{ account: Account; outcome: BarracksOutcome }>
  /** 탄 시작: 판 씨앗을 받음 (서버가 정해야 조작 불가) */
  startStage(stageNo: number): Promise<{ runId: string; seed: number }>
  /** 탄 끝: 배치만 보내면 같은 엔진으로 다시 돌려 판정 + 기록 저장 */
  finishStage(req: { runId: string; stageNo: number; placements: Placements }): Promise<{ account: Account; result: StageJudgement }>
  /** 시험판 전용 (서버엔 없음) */
  dev?: {
    grantTickets(n: number): Promise<Account>
    resetBarracks(seed: string): Promise<Account>
    setBest(best: number): Promise<Account>
    /** 모든 데이터 초기화: 캐릭·기록·별·골드를 비우고 첫 시작 권을 새로 받음 (= 새 계정) */
    resetAll(): Promise<Account>
    /** 지금 상태 저장 (2026-11-28 개발자): 계정(캐릭·티켓·기록·별·골드) + 화면 저장(맵별 배치)을 통째로 → 슬롯 목록 */
    snapshots(): DevSnapshot[]
    saveSnapshot(name: string): DevSnapshot[]
    /** 저장한 상태로 되돌림 (계정·배치 덮어씀) — 부른 뒤 화면을 새로 고침 */
    loadSnapshot(id: string): void
    deleteSnapshot(id: string): DevSnapshot[]
    /** "모든 탄 열기" — 열리지 않은 탄도 판정 */
    unlockAll: boolean
  }
}

/** 개발자 상태 저장 슬롯 */
export interface DevSnapshot {
  id: string
  name: string
  /** 저장 시각 (ISO) */
  at: string
  /** 한눈에 보기용 요약 */
  summary: { units: number; best: number; gold: number; tickets: number }
}

export class ApiError extends Error {}
