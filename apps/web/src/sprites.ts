/**
 * 스프라이트 시트 불러오기 + 그리기.
 * 시트는 `npm run sprites` 가 public/sprites 에 만든다 (가로 = 프레임, 세로 = 모션).
 */

export interface MotionInfo {
  row: number
  frames: number
  fps: number
  loop: boolean
}
interface EntityInfo {
  name: string
  kind: 'unit' | 'monster'
  cols: number
  rows: number
  motions: Record<string, MotionInfo>
}
interface Meta {
  frameSize: number
  entities: Record<string, EntityInfo>
}

let meta: Meta | null = null
const images = new Map<string, HTMLImageElement>()
let loading: Promise<void> | null = null

export function loadSprites(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    const res = await fetch('sprites/sprites.json')
    const m = (await res.json()) as Meta
    await Promise.all(
      Object.keys(m.entities).map(
        (id) =>
          new Promise<void>((resolve) => {
            const img = new Image()
            img.onload = () => {
              images.set(id, img)
              resolve()
            }
            img.onerror = () => resolve()
            img.src = `sprites/${id}.png`
          }),
      ),
    )
    meta = m
  })()
  return loading
}

export const spritesReady = () => meta !== null

/** 모션 길이 (밀리초). 없으면 0 */
export function motionDuration(id: string, motion: string): number {
  const m = meta?.entities[id]?.motions[motion]
  return m ? (m.frames * 1000) / m.fps : 0
}

/**
 * 스프라이트 한 장 그리기. 발밑(x, y) 기준, size = 화면에서의 프레임 크기(px).
 * t = 모션 시작 후 지난 시간(밀리초). 반복 모션은 돌고, 아니면 마지막 프레임에 멈춤.
 * 그릴 수 없으면 false (불러오기 전 등).
 */
export function drawSprite(ctx: CanvasRenderingContext2D, id: string, motion: string, t: number, x: number, y: number, size: number, flip = false): boolean {
  const e = meta?.entities[id]
  const img = images.get(id)
  const m = e?.motions[motion]
  if (!meta || !e || !img || !m) return false
  let f = Math.floor((Math.max(0, t) * m.fps) / 1000)
  f = m.loop ? f % m.frames : Math.min(f, m.frames - 1)
  const S = meta.frameSize
  // 프레임 안에서 발밑은 88/96 지점
  const top = y - size * (88 / 96)
  if (flip) {
    ctx.save()
    ctx.translate(x, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(img, f * S, m.row * S, S, S, -size / 2, top, size, size)
    ctx.restore()
  } else {
    ctx.drawImage(img, f * S, m.row * S, S, S, x - size / 2, top, size, size)
  }
  return true
}
