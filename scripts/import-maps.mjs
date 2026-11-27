/**
 * 엑셀 맵 → 엔진 맵: npm run maps  (docs/map유형.xlsx → packages/defense/src/maps.ts)
 *
 * 엑셀 그리는 법 (사용자 방식 그대로):
 * - 맵 이름(a, b, …)을 한 칸에 쓰고, 그 바로 아래부터 맵 칸을 그림
 * - 초록 칸 = 길, 테두리만 있는 흰 칸 = 배치 칸, 칸 글자 S = 입구, E = 출구
 * - 맵 이름 순서(알파벳 순)가 탄 순서. 맵 하나가 STAGES_PER_MAP 탄씩 (stages.ts)
 * 색은 "채우기가 있는 칸 = 길"로 판단 (초록이 아니어도 채우기만 있으면 길)
 */
import { unzipSync, strFromU8 } from 'fflate'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = process.argv[2] ?? join(root, 'docs', 'map유형.xlsx')
const zip = unzipSync(readFileSync(src))
const text = (p) => (zip[p] ? strFromU8(zip[p]) : '')

const sst = [...text('xl/sharedStrings.xml').matchAll(/<si>(.*?)<\/si>/gs)].map((m) => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''))
// 스타일 번호 → 채우기 있음/테두리 있음
const styles = text('xl/styles.xml')
const fills = [...styles.match(/<fills[^>]*>(.*?)<\/fills>/s)[1].matchAll(/<fill>(.*?)<\/fill>/gs)].map((m) => /patternType="solid"/.test(m[1]))
const borders = [...styles.match(/<borders[^>]*>(.*?)<\/borders>/s)[1].matchAll(/<border[^>]*>(.*?)<\/border>/gs)].map((m) => /style="/.test(m[1]))
const xfs = [...styles.match(/<cellXfs[^>]*>(.*?)<\/cellXfs>/s)[1].matchAll(/<xf ([^>]*)\/?>/g)].map((m) => ({
  fill: fills[Number(/fillId="(\d+)"/.exec(m[1])?.[1] ?? 0)] ?? false,
  border: borders[Number(/borderId="(\d+)"/.exec(m[1])?.[1] ?? 0)] ?? false,
}))

const colNum = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
const cells = new Map()
for (const m of text('xl/worksheets/sheet1.xml').matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
  const [, col, row, attrs, inner = ''] = m
  const s = Number(/ s="(\d+)"/.exec(attrs)?.[1] ?? 0)
  const t = / t="(\w+)"/.exec(attrs)?.[1]
  const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1] ?? /<t[^>]*>([^<]*)<\/t>/.exec(inner)?.[1]
  const val = t === 's' ? sst[Number(v)] : v
  cells.set(`${colNum(col)},${row}`, { ...(xfs[s] ?? { fill: false, border: false }), val: (val ?? '').trim() })
}

const isCell = (c) => c && (c.fill || c.border)
const titles = [...cells]
  .filter(([k, c]) => c.val && !isCell(c) && isCell(cells.get(`${k.split(',')[0]},${+k.split(',')[1] + 1}`)))
  .map(([k, c]) => ({ name: c.val, col: +k.split(',')[0], row: +k.split(',')[1] }))
  .sort((a, b) => a.name.localeCompare(b.name))

const maps = []
for (const t of titles) {
  const rows = []
  for (let r = t.row + 1; ; r++) {
    let line = ''
    for (let c = t.col; ; c++) {
      const cell = cells.get(`${c},${r}`)
      if (!isCell(cell)) break
      const v = cell.val.toUpperCase()
      line += v === 'S' ? 'S' : v === 'E' ? 'E' : cell.fill ? '#' : '.'
    }
    if (!line) break
    rows.push(line)
  }
  maps.push({ id: t.name, rows })
}

const body = maps
  .map((m) => `  {\n    id: '${m.id}',\n    name: '${m.id.toUpperCase()}',\n    rows: [\n${m.rows.map((r) => `      '${r}',`).join('\n')}\n    ],\n  },`)
  .join('\n')
writeFileSync(
  join(root, 'packages', 'defense', 'src', 'maps.ts'),
  `import type { MapDef } from './map.ts'

/**
 * 맵 (${maps.length}개). **직접 고치지 말 것** — docs/map유형.xlsx 를 고치고 \`npm run maps\` 로 다시 만듦.
 * 순서 = 탄 순서 (맵 하나가 STAGES_PER_MAP 탄씩). S = 입구, E = 출구, # = 길, . = 배치 칸
 */
export const MAP_DEFS: readonly MapDef[] = [
${body}
]
`,
)
console.log(`맵 ${maps.length}개: ${maps.map((m) => `${m.id}(${m.rows[0]?.length ?? 0}×${m.rows.length})`).join(' ')}`)
