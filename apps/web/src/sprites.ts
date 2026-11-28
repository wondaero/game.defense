/**
 * 스프라이트 그리기 (2026-11-28: PNG 없이 SVG 코드에서 바로).
 * - 그림 원본 = scripts/sprites/art.mjs (SVG 태그). 고치면 개발 서버가 바로 다시 그림
 * - 게임을 열 때 시트(SVG)마다 한 번만 픽셀로 바꿔 둠(RASTER_SCALE 배) → 판 위에선 그걸 잘라 그려서 가벼움
 * - 캐릭 목록 얼굴 등 HTML 에선 SVG 를 그대로 배경으로 (어떤 화면에서도 선명)
 */
import { spriteBook } from '../../../scripts/sprites/sheet.mjs'

const book = spriteBook()
const meta = book.meta
/** 픽셀로 바꿀 때 배율 (예전 PNG 와 같은 2배 — 칸 하나가 화면에서 60px 안팎이라 충분) */
const RASTER_SCALE = 2

const urls = new Map<string, string>()
const rasters = new Map<string, HTMLCanvasElement>()
let loading: Promise<void> | null = null
let ready = false

/** 별칭이면 실제 그림 이름 */
const fileOf = (id: string) => meta.entities[id]?.file ?? id

/** 시트 SVG 의 주소 (HTML 배경·img 용). 없으면 null */
export function sheetUrl(id: string): string | null {
  const file = fileOf(id)
  const hit = urls.get(file)
  if (hit) return hit
  const svg = book.sheetSvg(file)
  if (!svg) return null
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  urls.set(file, url)
  return url
}

async function rasterize(file: string): Promise<void> {
  const e = meta.entities[file]
  const url = sheetUrl(file)
  if (!e || !url || rasters.has(file)) return
  const img = new Image()
  img.src = url
  await img.decode()
  const cv = document.createElement('canvas')
  cv.width = Math.round(e.cols * meta.frame * RASTER_SCALE)
  cv.height = Math.round(e.rows * meta.frame * RASTER_SCALE)
  cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height)
  rasters.set(file, cv)
}

/** 시트 칸 수 (HTML 배경으로 첫 프레임만 보일 때 크기 계산용) */
export function sheetGrid(id: string): { cols: number; rows: number } | null {
  const e = meta.entities[fileOf(id)]
  return e ? { cols: e.cols, rows: e.rows } : null
}

/** 모든 시트를 미리 픽셀로 (한 번만). 끝나기 전엔 drawSprite 가 false → 동그라미로 대신 그림 */
export function loadSprites(): Promise<void> {
  if (loading) return loading
  loading = Promise.all(book.ids.map((id) => rasterize(id).catch(() => undefined))).then(() => {
    ready = true
  })
  return loading
}

export const spritesReady = () => ready

/** 모션 길이 (밀리초). 없으면 0 */
export function motionDuration(id: string, motion: string): number {
  const m = meta.entities[id]?.motions[motion]
  return m ? (m.frames * 1000) / m.fps : 0
}

/**
 * 스프라이트 한 장 그리기. 발밑(x, y) 기준, size = 화면에서의 그림 크기(px, 여백 뺀 것).
 * t = 모션 시작 후 지난 시간(밀리초). 반복 모션은 돌고, 아니면 마지막 프레임에 멈춤.
 * 그릴 수 없으면 false (아직 준비 전 등).
 */
export function drawSprite(ctx: CanvasRenderingContext2D, id: string, motion: string, t: number, x: number, y: number, size: number, flip = false): boolean {
  const e = meta.entities[id]
  const img = rasters.get(fileOf(id))
  const m = e?.motions[motion]
  if (!e || !img || !m) return false
  let f = Math.floor((Math.max(0, t) * m.fps) / 1000)
  f = m.loop ? f % m.frames : Math.min(f, m.frames - 1)
  const S = meta.frame * RASTER_SCALE
  // size = 그림(여백 뺀) 크기 → 실제로 그릴 프레임은 여백만큼 더 큼
  size = size / meta.content
  const top = y - size * meta.footY
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
