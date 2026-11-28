import { describe, expect, it } from 'vitest'
import { pierceLine, type GameMap } from '../src/index.ts'

/**
 * 관통 줄 (spec 17, 2026-11-28 사용자 예시)
 *   ㅁㅁㅁㅁㅇㅅ      ㅁ = 길, ㅇ = 맞은 슬라임, ㅅ = 캐릭
 *   ㅁ         ㅁ
 *   ㅁㅁㅁㅁㅁ
 * ㅇ 을 때려 관통이 터지면 윗줄 길 칸이 다 맞음 (꺾인 아래쪽 길은 안 맞음)
 */
const path = [
  ...[0, 1, 2, 3, 4].map((x) => ({ x, y: 0 })),
  { x: 0, y: 1 },
  ...[0, 1, 2, 3, 4].map((x) => ({ x, y: 2 })),
  { x: 5, y: 1 },
]
const map = { width: 6, height: 3, path, tiles: [] } as unknown as GameMap

describe('관통 줄', () => {
  it('캐릭 → 맞은 칸 방향으로 길이 곧게 이어지는 칸 전부', () => {
    expect(pierceLine(map, { x: 5, y: 0 }, { x: 4, y: 0 })).toEqual([4, 3, 2, 1, 0].map((x) => ({ x, y: 0 })))
  })
  it('풀밭을 만나면 멈춤', () => {
    // 위에서 아래로 쏘면 (0,0) → (0,1) → (0,2) 까지, 그 아래는 판 밖
    expect(pierceLine(map, { x: 0, y: -1 }, { x: 0, y: 0 })).toEqual([0, 1, 2].map((y) => ({ x: 0, y })))
    // (2,0) 을 위에서 때리면 (2,1) 은 풀밭이라 거기서 멈춤
    expect(pierceLine(map, { x: 2, y: -1 }, { x: 2, y: 0 })).toEqual([{ x: 2, y: 0 }])
  })
  it('대각선·비스듬히 쏘면 맞힌 그 한 칸만', () => {
    expect(pierceLine(map, { x: 5, y: 1 }, { x: 4, y: 0 })).toEqual([{ x: 4, y: 0 }])
    expect(pierceLine(map, { x: 6, y: 1 }, { x: 4, y: 0 })).toEqual([{ x: 4, y: 0 }])
  })
})
