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

import { makeConfig, MAP_DEFS, parseMap, rollRoster, createRngState, smartPlace, pathCorners, statScore } from '../src/index.ts'
describe('스마트 배치', () => {
  const cfg = makeConfig()
  const map = parseMap(MAP_DEFS[0]!)
  const roster = rollRoster(cfg, createRngState('스마트')).units
  it('능력치 점수 높은 10명 · 겹치지 않음 · 같은 입력이면 같은 결과', () => {
    const p = smartPlace(cfg, map, roster)
    const ids = Object.keys(p)
    expect(ids.length).toBe(cfg.maxDeploy)
    expect(new Set(Object.values(p).map((c) => `${c!.x},${c!.y}`)).size).toBe(ids.length)
    const top = [...roster].sort((a, b) => statScore(cfg, { ...b, ability: null }) - statScore(cfg, { ...a, ability: null }))[0]!
    expect(ids).toContain(top.id)
    expect(smartPlace(cfg, map, roster)).toEqual(p)
    expect(pathCorners(map).length).toBeGreaterThan(0)
  })
  it('이미 놓은 캐릭은 그대로, 빈 자리만', () => {
    const first = smartPlace(cfg, map, roster)
    const [id, cell] = Object.entries(first)[0]!
    const p = smartPlace(cfg, map, roster, { [id]: cell! })
    expect(p[id]).toEqual(cell)
    expect(Object.keys(p).length).toBe(cfg.maxDeploy)
  })
})
