/**
 * 스프라이트 만들기: node scripts/sprites/build.mjs  (= npm run sprites)
 *
 * art.mjs 의 그림 → 개체마다 시트 1장 (가로 = 프레임, 세로 = 모션)
 *   apps/web/public/sprites/<id>.svg   합친 원본 (그림 그대로, 고치기 쉬움)
 *   apps/web/public/sprites/<id>.png   게임이 쓰는 이미지 (2배 해상도)
 *   apps/web/public/sprites/sprites.json  모션별 줄 번호·프레임 수·속도
 *   apps/web/public/sprites/preview.html  한눈에 보기
 */
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALIASES, entities, SIZE } from './art.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = join(root, 'apps', 'web', 'public', 'sprites')
mkdirSync(outDir, { recursive: true })

const SCALE = 2
const meta = { frameSize: SIZE * SCALE, entities: {} }
const previews = []

for (const e of entities()) {
  const motionNames = Object.keys(e.motions)
  const cols = Math.max(...motionNames.map((m) => e.motions[m].frames.length))
  const rows = motionNames.length
  let body = ''
  const motions = {}
  motionNames.forEach((name, row) => {
    const m = e.motions[name]
    motions[name] = { row, frames: m.frames.length, fps: m.fps, loop: m.loop }
    m.frames.forEach((pose, col) => {
      body += `<g transform="translate(${col * SIZE} ${row * SIZE})">${e.draw(pose)}</g>\n`
    })
  })
  const w = cols * SIZE
  const h = rows * SIZE
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}</svg>\n`
  writeFileSync(join(outDir, `${e.id}.svg`), svg)
  const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: SCALE } }).render().asPng()
  writeFileSync(join(outDir, `${e.id}.png`), png)
  meta.entities[e.id] = { name: e.name, kind: e.kind, cols, rows, motions }
  previews.push(`<section><h3>${e.name} <small>${e.id}</small></h3><img src="${e.id}.png" width="${w}"><p>${motionNames.map((n) => `${n} ${e.motions[n].frames.length}프레임`).join(' · ')}</p></section>`)
  console.log(`${e.id}: ${cols}×${rows} → ${png.length} bytes`)
}

// 별칭: 게임의 몬스터 종류(mon_normal 등) → 실제 그림 파일
for (const [alias, target] of Object.entries(ALIASES)) meta.entities[alias] = { ...meta.entities[target], file: target }
writeFileSync(join(outDir, 'sprites.json'), JSON.stringify(meta, null, 2))
writeFileSync(
  join(outDir, 'preview.html'),
  `<!doctype html><meta charset="utf-8"><title>스프라이트 미리 보기</title><style>body{background:#1b1f24;color:#eee;font-family:sans-serif}img{background:#3d5a40;image-rendering:auto}section{margin:12px 0}small{color:#999}</style>${previews.join('\n')}`,
)
console.log('완료:', outDir)
