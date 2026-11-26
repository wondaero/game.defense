/** 비율 단위 basis point (1% = 100, 100% = 10000) */
export const BP = 10_000
export const applyBp = (amount: number, bp: number) => Math.floor((amount * bp) / BP)

export interface Range {
  min: number
  max: number
}

/**
 * 시험판에서 바꿔 가며 볼 설정. 판 크기는 맵 데이터(maps.ts)가 정한다.
 * 모든 계산은 정수: 거리 단위는 "칸 = CELL" (1000).
 */
export interface DefenseConfig {
  /** 1초에 몇 번 계산하나 (고정 틱) */
  tickRate: number
  /** 출전 수 (한 번에 판에 세울 수 있는 캐릭 수) */
  maxDeploy: number
  /** 보관함(시험판 후보) 캐릭 수. 그림은 겹쳐도 됨 */
  rosterSize: number
  /** 사거리 모양: 마름모(가로+세로 칸 수) / 사각형(대각선도 1칸) */
  rangeShape: 'diamond' | 'square'
  /** 능력치 뽑기 범위 */
  atk: Range
  range: Range
  /** 민첩 뽑기 범위 (최대 10, 레벨업으로 11~13 가능). 명중률 = 내 민첩 ÷ (내 민첩 + 몬스터 민첩) */
  agility: Range
  /** 공속 뽑기 범위 (1~5, 같은 확률). 공속 N = 1초에 N대 (레벨업 중엔 최대 8) */
  attackSpeed: Range
  /** 시작 목숨 */
  startLives: number
  /** 몬스터 속도·체력 배율 */
  monsterSpeedBp: number
  monsterHpBp: number
  /** 특수능력이 붙을 확률 (캐릭당 0~1개, 2026-11-26: 30~40% 중 30% 기본) */
  abilityChanceBp: number
}

export const DEFAULT_CONFIG: Readonly<DefenseConfig> = Object.freeze({
  tickRate: 20,
  maxDeploy: 10,
  rosterSize: 12,
  rangeShape: 'diamond',
  atk: { min: 10, max: 30 },
  range: { min: 1, max: 2 },
  agility: { min: 5, max: 10 },
  attackSpeed: { min: 1, max: 5 },
  startLives: 20,
  monsterSpeedBp: 10_000,
  monsterHpBp: 10_000,
  abilityChanceBp: 3000,
})

export function makeConfig(overrides: Partial<DefenseConfig> = {}): DefenseConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

/** 공속 N = 이 시간(밀리초) 동안 N대 = 1초에 N대 (2026-11-26 사용자 결정) */
export const ATTACK_WINDOW_MS = 1000
/** 레벨업(아군 전체 레벨업)으로 올라갈 수 있는 공속 최대 (뽑기는 최대 5, +3 까지) */
export const MAX_ATTACK_SPEED = 8

/** 밀리초 → 틱 (최소 1) */
export const msToTicks = (cfg: DefenseConfig, ms: number) => Math.max(1, Math.round((ms * cfg.tickRate) / 1000))
