/**
 * 스프라이트 미리 보기 만들기: node scripts/sprites/build.mjs  (= npm run sprites, dev·build 때 자동)
 *
 * 2026-11-28: 게임은 art.mjs 를 직접 읽어 그 자리에서 그림 (sheet.mjs) → PNG 없음.
 * 여기선 개발자 탭 "스프라이트 모아 보기"용 파일만 만든다 (저장소엔 안 올림, .gitignore):
 *   apps/web/public/sprites/<id>.svg      개체별 시트
 *   apps/web/public/sprites/preview.html  한눈에 보기
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spriteBook, FRAME } from './sheet.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = join(root, 'apps', 'web', 'public', 'sprites')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const { meta, sheetSvg, ids } = spriteBook()
const previews = []
for (const id of ids) {
  const e = meta.entities[id]
  writeFileSync(join(outDir, `${id}.svg`), sheetSvg(id))
  const motions = Object.entries(e.motions).map(([n, m]) => `${n} ${m.frames}프레임`)
  previews.push(`<section><h3>${e.name} <small>${id}</small></h3><img src="${id}.svg" width="${e.cols * FRAME}"><p>${motions.join(' · ')}</p></section>`)
}
writeFileSync(
  join(outDir, 'preview.html'),
  `<!doctype html><meta charset="utf-8"><title>스프라이트 미리 보기</title><style>body{background:#eef6e2;color:#3f3123;font-family:sans-serif}img{background:#7cbd5a;border-radius:8px}section{margin:12px 0}small{color:#8b7b65}</style>${previews.join('\n')}`,
)
console.log(`스프라이트 미리 보기 ${ids.length}개 → ${outDir}`)
