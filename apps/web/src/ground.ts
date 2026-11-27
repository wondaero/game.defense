import { positionAt, type GameMap } from '@def/defense'

/**
 * 판 바닥 그림 (풀밭 + 부드러운 길 + 입구·출구). 맵마다 한 번 그려 두고 재사용.
 * - 'play'   : 진행 중. 네모 칸 없이 풀밭 위에 길만
 * - 'prepare': 배치 중. 배치 칸을 네모로 보여 줌 + 길 방향 화살표
 */
export type GroundMode = 'play' | 'prepare'

const cache = new Map<string, HTMLCanvasElement>()

/** 칸마다 고정된 무작위 (장식 위치용, 매번 같게) */
function hash(x: number, y: number, k: number): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function groundImage(map: GameMap, mode: GroundMode, cell: number, scale: number): HTMLCanvasElement {
  const key = `${map.id}|${mode}|${cell}|${scale}`
  const hit = cache.get(key)
  if (hit) return hit
  const W = map.width * cell
  const H = map.height * cell
  const cv = document.createElement('canvas')
  cv.width = Math.round(W * scale)
  cv.height = Math.round(H * scale)
  const ctx = cv.getContext('2d')!
  ctx.scale(scale, scale)

  // 풀밭: 둥근 판 + 위에서 아래로 살짝 어두워지는 초록
  const r = cell * 0.35
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, W, H, r)
  ctx.clip()
  const gr = ctx.createLinearGradient(0, 0, 0, H)
  gr.addColorStop(0, '#79b85a')
  gr.addColorStop(1, '#5f9e48')
  ctx.fillStyle = gr
  ctx.fillRect(0, 0, W, H)

  // 풀 무늬 (칸마다 조금씩): 밝은 점·풀잎·작은 꽃
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y]![x] === 'path') continue
      for (let k = 0; k < 3; k++) {
        const px = (x + 0.15 + hash(x, y, k) * 0.7) * cell
        const py = (y + 0.15 + hash(x, y, k + 9) * 0.7) * cell
        ctx.strokeStyle = 'rgba(40,90,30,0.45)'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(px - 3, py + 3)
        ctx.lineTo(px - 1, py - 3)
        ctx.moveTo(px + 1, py + 3)
        ctx.lineTo(px + 3, py - 2)
        ctx.stroke()
      }
      if (hash(x, y, 31) < 0.22) {
        const px = (x + 0.2 + hash(x, y, 32) * 0.6) * cell
        const py = (y + 0.2 + hash(x, y, 33) * 0.6) * cell
        ctx.fillStyle = ['#fff59d', '#f8bbd0', '#ffffff'][Math.floor(hash(x, y, 34) * 3)]!
        for (let a = 0; a < 5; a++) {
          ctx.beginPath()
          ctx.arc(px + Math.cos((a * Math.PI * 2) / 5) * 2.4, py + Math.sin((a * Math.PI * 2) / 5) * 2.4, 1.8, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = '#ffb300'
        ctx.beginPath()
        ctx.arc(px, py, 1.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // 길: 입구 가장자리 → 출구 칸 가운데까지 굵고 둥근 선 (테두리 → 흙 → 가운데 밝은 줄)
  const pts: { x: number; y: number }[] = []
  for (let dist = 0; dist <= map.length; dist += 250) pts.push(positionAt(map, dist))
  pts.push(positionAt(map, map.length))
  const road = (width: number, color: string) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x * cell, p.y * cell) : ctx.moveTo(p.x * cell, p.y * cell)))
    ctx.stroke()
  }
  road(cell * 0.86, '#8d6e4a')
  road(cell * 0.74, '#d9b98a')
  road(cell * 0.3, 'rgba(255,255,255,0.12)')
  // 길 위 작은 돌멩이
  for (const [i, c] of map.path.entries()) {
    if (hash(c.x, c.y, 50 + i) > 0.55) continue
    ctx.fillStyle = 'rgba(120,90,60,0.45)'
    ctx.beginPath()
    ctx.ellipse((c.x + 0.3 + hash(c.x, c.y, 51) * 0.4) * cell, (c.y + 0.3 + hash(c.x, c.y, 52) * 0.4) * cell, 2.6, 1.8, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  if (mode === 'prepare') {
    // 배치 칸 네모 (둥근 모서리, 반투명)
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y]![x] !== 'slot') continue
        ctx.fillStyle = 'rgba(255,255,255,0.10)'
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect(x * cell + 4, y * cell + 4, cell - 8, cell - 8, 7)
        ctx.fill()
        ctx.stroke()
      }
    }
    // 길 방향 화살표 (두 칸마다)
    ctx.fillStyle = 'rgba(110,75,40,0.55)'
    for (let dist = 1500; dist < map.length - 300; dist += 2000) {
      const a = positionAt(map, dist - 150)
      const b = positionAt(map, dist + 150)
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const p = positionAt(map, dist)
      ctx.save()
      ctx.translate(p.x * cell, p.y * cell)
      ctx.rotate(ang)
      ctx.beginPath()
      ctx.moveTo(7, 0)
      ctx.lineTo(-5, -6)
      ctx.lineTo(-2, 0)
      ctx.lineTo(-5, 6)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.restore()

  // 입구(파란 굴) · 출구(빨간 구멍)
  const portal = (c: { x: number; y: number }, outer: string, inner: string, text: string) => {
    const px = (c.x + 0.5) * cell
    const py = (c.y + 0.5) * cell
    ctx.fillStyle = outer
    ctx.beginPath()
    ctx.ellipse(px, py, cell * 0.36, cell * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = inner
    ctx.beginPath()
    ctx.ellipse(px, py + 2, cell * 0.25, cell * 0.19, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `bold ${Math.round(cell * 0.2)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 글자는 굴 위에, 맨 윗줄이면 판 밖으로 잘리니 아래에
    const ty = c.y === 0 ? py + cell * 0.4 : py - cell * 0.38
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.strokeText(text, px, ty)
    ctx.fillStyle = '#fff'
    ctx.fillText(text, px, ty)
  }
  portal(map.path[0]!, '#1e88e5', '#0d2b4f', '입구')
  // 출구 = 레이스 결승선 (2026-11-27): 칸에 검정·흰색 체크무늬 + 체크 깃발
  {
    const e = map.path.at(-1)!
    const x0 = e.x * cell + 4
    const y0 = e.y * cell + 4
    const w = cell - 8
    const n = 5
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x0, y0, w, w, 6)
    ctx.clip()
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#212121' : '#fafafa'
      ctx.fillRect(x0 + (i * w) / n, y0 + (j * w) / n, w / n + 0.5, w / n + 0.5)
    }
    ctx.restore()
    ctx.strokeStyle = '#424242'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x0, y0, w, w, 6)
    ctx.stroke()
    // 깃발은 판 밖으로 나갈 수 있어 draw.ts 에서 그림 (drawFinishFlag)
    // "출구" 글자
    ctx.font = `bold ${Math.round(cell * 0.2)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // 체크무늬 가운데 어두운 띠 위에 (깃발과 안 겹치게)
    const cxm = x0 + w / 2
    const cym = y0 + w * 0.62
    ctx.fillStyle = 'rgba(0,0,0,0.72)'
    ctx.beginPath()
    ctx.roundRect(cxm - cell * 0.27, cym - cell * 0.13, cell * 0.54, cell * 0.26, 5)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText('출구', cxm, cym + 1)
  }

  cache.set(key, cv)
  return cv
}

/** 출구 체크 깃발 (판 밖 여백까지 그려지게 판 그림과 따로) */
export function drawFinishFlag(ctx: CanvasRenderingContext2D, map: GameMap, cell: number, now: number) {
  const e = map.path.at(-1)!
  const x0 = e.x * cell + 4
  const y0 = e.y * cell + 4
  const w = cell - 8
  const px = x0 + w - 8
  const top = y0 - cell * 0.28
  ctx.strokeStyle = '#5d4037'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(px, y0 + w * 0.4)
  ctx.lineTo(px, top)
  ctx.stroke()
  // 바람에 살짝 펄럭임
  const fw = cell * 0.36
  const fh = cell * 0.24
  for (let i = 0; i < 4; i++) {
    const wave = Math.sin(now / 180 + i * 0.9) * 1.6
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#212121' : '#fafafa'
      ctx.fillRect(px - fw + (i * fw) / 4, top + (j * fh) / 3 + wave * (i / 3), fw / 4 + 0.5, fh / 3 + 0.5)
    }
  }
  ctx.lineWidth = 1
}
