/** sheet.mjs 의 타입 (게임 TS 코드에서 쓰려고) */
export interface MotionInfo {
  row: number
  frames: number
  fps: number
  loop: boolean
}
export interface EntityInfo {
  name: string
  kind: 'unit' | 'monster'
  cols: number
  rows: number
  motions: Record<string, MotionInfo>
  /** 별칭이면 실제 그림 이름 */
  file?: string
}
export interface SpriteMeta {
  /** 프레임 한 칸 (그림 단위) */
  frame: number
  /** 프레임 안에서 그림(96)이 차지하는 비율 — 둘레는 여백 */
  content: number
  /** 발밑 높이 (프레임 안 비율) */
  footY: number
  entities: Record<string, EntityInfo>
}
export declare const PAD: number
export declare const FRAME: number
export declare function spriteBook(): {
  meta: SpriteMeta
  sheetSvg(id: string): string | null
  ids: string[]
}
