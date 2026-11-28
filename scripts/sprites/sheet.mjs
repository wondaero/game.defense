/**
 * 스프라이트 시트 (2026-11-28): art.mjs 의 SVG 코드 → 개체마다 시트 SVG 1장 (가로 = 프레임, 세로 = 모션).
 * Node(build.mjs 미리 보기)와 브라우저(게임, apps/web/src/sprites.ts)가 같이 씀 → PNG 변환 단계 없음.
 * 그림을 고치려면 art.mjs 의 SVG 태그만 고치면 됨 (개발 서버는 저장하면 바로 반영).
 */
import { ALIASES, entities, SIZE } from './art.mjs'

/** 프레임 둘레 여백 (그림 단위). 휘두르는 도구·별이 프레임 밖으로 나가 잘리거나 옆 프레임에 닿지 않게 (2026-11-27) */
export const PAD = 16
export const FRAME = SIZE + PAD * 2

/**
 * 모든 개체의 모션 정보(가벼움, 바로 계산)와, 시트 SVG 를 필요할 때 만드는 함수.
 * meta.frame = 프레임 한 칸(그림 단위), content = 그림(96)이 프레임에서 차지하는 비율, footY = 발밑 높이(프레임 안 비율)
 */
export function spriteBook() {
  const list = entities()
  const byId = new Map(list.map((e) => [e.id, e]))
  const meta = { frame: FRAME, content: SIZE / FRAME, footY: (PAD + 88) / FRAME, entities: {} }
  for (const e of list) {
    const names = Object.keys(e.motions)
    const motions = {}
    names.forEach((name, row) => {
      const m = e.motions[name]
      motions[name] = { row, frames: m.frames.length, fps: m.fps, loop: m.loop }
    })
    meta.entities[e.id] = { name: e.name, kind: e.kind, cols: Math.max(...names.map((n) => e.motions[n].frames.length)), rows: names.length, motions }
  }
  // 별칭: 게임의 이름 → 실제 그림
  for (const [alias, target] of Object.entries(ALIASES)) meta.entities[alias] = { ...meta.entities[target], file: target }

  const cache = new Map()
  /** 시트 SVG 문자열 (별칭이면 실제 그림). 없으면 null */
  function sheetSvg(id) {
    const file = meta.entities[id]?.file ?? id
    if (cache.has(file)) return cache.get(file)
    const e = byId.get(file)
    if (!e) return null
    const info = meta.entities[file]
    let body = ''
    Object.keys(e.motions).forEach((name, row) => {
      e.motions[name].frames.forEach((pose, col) => {
        body += `<g transform="translate(${col * FRAME + PAD} ${row * FRAME + PAD})">${e.draw(pose)}</g>\n`
      })
    })
    const w = info.cols * FRAME
    const h = info.rows * FRAME
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}</svg>\n`
    cache.set(file, svg)
    return svg
  }
  return { meta, sheetSvg, ids: list.map((e) => e.id) }
}
