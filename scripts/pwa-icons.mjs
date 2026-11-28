/**
 * PWA 아이콘 만들기 (2026-11-28): node scripts/pwa-icons.mjs  (= npm run icons)
 * art.mjs 그림(무지개 헬멧 캐릭 + 슬라임)으로 SVG 를 짜고, 설치된 Chrome(헤드리스)으로 찍어 PNG 를 만듦 → apps/web/public/icons/
 * (resvg 는 이 그림에서 멈춰서 Chrome 사용. Chrome 경로가 다르면 CHROME=... 로)
 * 그림을 바꾸면 다시 실행. 결과 PNG 는 저장소에 올림 (배포 때 다시 만들 필요 없게)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { spriteBook, FRAME } from './sprites/sheet.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'apps', 'web', 'public', 'icons')
mkdirSync(out, { recursive: true })
const { sheetSvg } = spriteBook()

/** 시트의 첫 프레임만 (x, y) 에 size 크기로 */
const frame = (id, x, y, size) => sheetSvg(id).replace(/^<svg[^>]*>/, `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${FRAME} ${FRAME}" overflow="hidden">`)

/**
 * pad = 그림 둘레 안전 여백 비율 (maskable 은 둥글게·동그랗게 잘려도 그림이 안 잘리게 크게)
 * round = 모서리 둥글게 (일반 아이콘만, maskable·애플은 OS 가 깎음)
 */
function icon(px, { pad = 0.08, round = false } = {}) {
  const S = 512
  const inner = S * (1 - pad * 2)
  const o = S * pad
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${S} ${S}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ad27a"/><stop offset="1" stop-color="#5ea843"/></linearGradient></defs>
  <rect width="${S}" height="${S}" rx="${round ? 112 : 0}" fill="url(#bg)"/>
  <ellipse cx="${S / 2}" cy="${o + inner * 0.86}" rx="${inner * 0.42}" ry="${inner * 0.07}" fill="#000" opacity="0.15"/>
  ${frame('mon_normal', o + inner * 0.5, o + inner * 0.405, inner * 0.56)}
  ${frame('unit_t6', o - inner * 0.14, o + inner * 0.05, inner * 1.0)}
</svg>`
}

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { pad: 0.16 }],
  ['apple-touch-icon.png', 180, { pad: 0.1 }],
  ['favicon-64.png', 64, { round: true, pad: 0.04 }],
]
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
for (const [name, px, opt] of jobs) {
  const html = join(tmpdir(), `pwa-icon-${px}.html`)
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${icon(px, opt)}</body></html>`)
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--force-device-scale-factor=1', `--window-size=${px},${px}`, `--screenshot=${join(out, name)}`, `file://${html}`], { stdio: 'ignore' })
}
console.log(`PWA 아이콘 ${jobs.length}개 → ${out}`)
