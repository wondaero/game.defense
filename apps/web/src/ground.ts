import { positionAt, type GameMap } from '@def/defense'
import type { StageTheme } from './format.ts'

/**
 * 판 바닥 그림 (풀밭 또는 얼음 + 부드러운 길 + 입구·출구). 맵·스킨마다 한 번 그려 두고 재사용.
 * 스킨 (2026-11-28): grass = 풀밭·흙길·꽃 / ice = 눈밭·얼음 길·눈송이·얼음 결정
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

/** 스킨별 색 */
const SKINS = {
  grass: {
    top: '#79b85a',
    bottom: '#5f9e48',
    blade: 'rgba(40,90,30,0.45)',
    roadEdge: '#8d6e4a',
    roadFill: '#d9b98a',
    roadLine: 'rgba(255,255,255,0.12)',
    pebble: 'rgba(120,90,60,0.45)',
    slotFill: 'rgba(255,255,255,0.10)',
    slotLine: 'rgba(255,255,255,0.45)',
    arrow: 'rgba(110,75,40,0.55)',
  },
  ice: {
    top: '#f1f9fd',
    bottom: '#cfe6f2',
    blade: 'rgba(120,170,205,0.5)',
    roadEdge: '#6f93ad',
    roadFill: '#b9d9ea',
    roadLine: 'rgba(255,255,255,0.55)',
    pebble: 'rgba(255,255,255,0.85)',
    slotFill: 'rgba(60,120,170,0.08)',
    slotLine: 'rgba(60,120,170,0.45)',
    arrow: 'rgba(60,100,135,0.55)',
  },
} as const

export function groundImage(map: GameMap, mode: GroundMode, cell: number, scale: number, theme: StageTheme = 'grass'): HTMLCanvasElement {
  const key = `${map.id}|${mode}|${cell}|${scale}|${theme}`
  const S = SKINS[theme]
  const ice = theme === 'ice'
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
  gr.addColorStop(0, S.top)
  gr.addColorStop(1, S.bottom)
  ctx.fillStyle = gr
  ctx.fillRect(0, 0, W, H)

  // 풀 무늬 (칸마다 조금씩): 밝은 점·풀잎·작은 꽃
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y]![x] === 'path') continue
      for (let k = 0; k < 3; k++) {
        const px = (x + 0.15 + hash(x, y, k) * 0.7) * cell
        const py = (y + 0.15 + hash(x, y, k + 9) * 0.7) * cell
        ctx.strokeStyle = S.blade
        ctx.lineWidth = 1.6
        ctx.beginPath()
        if (ice) {
          // 눈 더미 결: 짧은 곡선 + 반짝 점
          ctx.arc(px, py + 2, 4, Math.PI * 1.1, Math.PI * 1.9)
          ctx.stroke()
          ctx.fillStyle = 'rgba(255,255,255,0.95)'
          ctx.beginPath()
          ctx.arc(px + 2, py - 2, 1.1, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        ctx.moveTo(px - 3, py + 3)
        ctx.lineTo(px - 1, py - 3)
        ctx.moveTo(px + 1, py + 3)
        ctx.lineTo(px + 3, py - 2)
        ctx.stroke()
      }
      if (ice && hash(x, y, 31) < 0.22) {
        // 얼음 결정 (작은 눈송이)
        const px = (x + 0.2 + hash(x, y, 32) * 0.6) * cell
        const py = (y + 0.2 + hash(x, y, 33) * 0.6) * cell
        ctx.strokeStyle = 'rgba(100,170,215,0.85)'
        ctx.lineWidth = 1.3
        ctx.beginPath()
        for (let a = 0; a < 3; a++) {
          const ang = (a * Math.PI) / 3
          ctx.moveTo(px - Math.cos(ang) * 4, py - Math.sin(ang) * 4)
          ctx.lineTo(px + Math.cos(ang) * 4, py + Math.sin(ang) * 4)
        }
        ctx.stroke()
      } else if (hash(x, y, 31) < 0.22) {
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
  road(cell * 0.86, S.roadEdge)
  road(cell * 0.74, S.roadFill)
  road(cell * 0.3, S.roadLine)
  // 길 위 작은 돌멩이
  for (const [i, c] of map.path.entries()) {
    if (hash(c.x, c.y, 50 + i) > 0.55) continue
    ctx.fillStyle = S.pebble
    ctx.beginPath()
    ctx.ellipse((c.x + 0.3 + hash(c.x, c.y, 51) * 0.4) * cell, (c.y + 0.3 + hash(c.x, c.y, 52) * 0.4) * cell, 2.6, 1.8, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  if (mode === 'prepare') {
    // 배치 칸 네모 (둥근 모서리, 반투명)
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y]![x] !== 'slot') continue
        ctx.fillStyle = S.slotFill
        ctx.strokeStyle = S.slotLine
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.roundRect(x * cell + 4, y * cell + 4, cell - 8, cell - 8, 7)
        ctx.fill()
        ctx.stroke()
      }
    }
    // 길 방향 화살표 (두 칸마다)
    ctx.fillStyle = S.arrow
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

  // 입구 = 블랙홀 (2026-11-27). 소용돌이는 움직여야 해서 draw.ts 에서(drawBlackHole), 여기선 "입구" 글자만
  const portal = (c: { x: number; y: number }, text: string) => {
    const px = (c.x + 0.5) * cell
    const py = (c.y + 0.5) * cell
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
  // 글자는 배치 중에만 (2026-11-28: 진행 중엔 빼서 판을 깔끔하게), 이름은 출발 · 도착
  if (mode === 'prepare') portal(map.path[0]!, '출발')
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
    // "도착" 글자 (배치 중에만)
    if (mode === 'prepare') {
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
    ctx.fillText('도착', cxm, cym + 1)
    }
  }

  cache.set(key, cv)
  return cv
}

/** 입구 블랙홀: 보라 소용돌이가 빙글빙글 돌고 가운데는 깜깜. 몬스터가 여기서 커지며 나옴 (draw.ts) */
export function drawBlackHole(ctx: CanvasRenderingContext2D, map: GameMap, cell: number, now: number) {
  const c = map.path[0]!
  const x = (c.x + 0.5) * cell
  const y = (c.y + 0.5) * cell
  const R = cell * 0.4
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, 0.78)
  // 바깥 빛무리
  const glow = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.15)
  glow.addColorStop(0, 'rgba(124,77,255,0.9)')
  glow.addColorStop(0.6, 'rgba(74,20,140,0.55)')
  glow.addColorStop(1, 'rgba(74,20,140,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(0, 0, R * 1.15, 0, Math.PI * 2)
  ctx.fill()
  // 소용돌이 팔 4개 (빨려 들어가는 방향으로 회전)
  ctx.rotate(-now / 700)
  ctx.lineCap = 'round'
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2)
    ctx.strokeStyle = k % 2 ? 'rgba(179,136,255,0.95)' : 'rgba(234,128,252,0.85)'
    ctx.lineWidth = cell * 0.05
    ctx.beginPath()
    for (let i = 0; i <= 16; i++) {
      const t = i / 16
      const r = R * (0.95 - t * 0.7)
      const a = t * 2.4
      const px = Math.cos(a) * r
      const py = Math.sin(a) * r
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
    }
    ctx.stroke()
  }
  // 가운데 깜깜한 구멍
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.42)
  core.addColorStop(0, '#000')
  core.addColorStop(0.75, '#0b0420')
  core.addColorStop(1, 'rgba(11,4,32,0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.lineWidth = 1
}

/** 출구 깃발 (판 밖 여백까지 그려지게 판 그림과 따로) */
export function drawFinishFlag(ctx: CanvasRenderingContext2D, map: GameMap, cell: number, now: number) {
  const e = map.path.at(-1)!
  const x0 = e.x * cell + 4
  const y0 = e.y * cell + 4
  const w = cell - 8
  // 깃대는 원래대로 칸 오른쪽, 깃발만 오른쪽을 향하게 (2026-11-28)
  const px = x0 + w - 8
  const top = y0 - cell * 0.28
  ctx.strokeStyle = '#5d4037'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(px, y0 + w * 0.4)
  ctx.lineTo(px, top)
  ctx.stroke()
  // 빨간 삼각 깃발 하나 (2026-11-27 체크 깃발 대신, 단출하게). 끝이 바람에 살짝 흔들림
  const fw = cell * 0.36
  const fh = cell * 0.26
  const wave = Math.sin(now / 200) * 1.8
  ctx.fillStyle = '#e53935'
  ctx.strokeStyle = '#7f1d1d'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(px, top)
  ctx.lineTo(px + fw, top + fh / 2 + wave)
  ctx.lineTo(px, top + fh)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.lineWidth = 1
}
