/**
 * 스프라이트 그림 (SVG 코드로 직접 그림).
 * 프레임 한 장 = 96×96, 발밑 기준선 y=88. 몬스터는 오른쪽을 보고 그림 (왼쪽으로 갈 땐 게임에서 뒤집음).
 *
 * 개체 = { id, name, motions: { 모션: { fps, loop, frames: [포즈...] } }, draw(포즈) → SVG 조각 }
 * 포즈를 바꿔 가며 같은 그림 함수를 다시 부르는 방식 → 모션을 늘리기 쉬움.
 */

export const SIZE = 96
const OUT = '#2a2230'
const SW = 2.5

// ── 색 도우미 ──
const hex = (c) => {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
export const mix = (a, b, t) => {
  const x = hex(a)
  const y = hex(b)
  return toHex(x.map((v, i) => v + (y[i] - v) * t))
}

// ── SVG 도우미 ──
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
const ell = (cx, cy, rx, ry, fill, extra = {}) => `<ellipse ${attrs({ cx, cy, rx, ry, fill, stroke: OUT, 'stroke-width': SW, ...extra })}/>`
const circ = (cx, cy, r, fill, extra = {}) => `<circle ${attrs({ cx, cy, r, fill, stroke: OUT, 'stroke-width': SW, ...extra })}/>`
const path = (d, fill, extra = {}) => `<path ${attrs({ d, fill, stroke: OUT, 'stroke-width': SW, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra })}/>`
const g = (transform, inner, extra = {}) => `<g ${attrs({ transform, ...extra })}>${inner}</g>`
const star = (cx, cy, r, fill) => {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const rr = i % 2 ? r * 0.45 : r
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>`
}

/** 네 갈래 반짝이 (✦ 모양) */
const twinkle = (cx, cy, r) =>
  `<path d="M${cx},${cy - r} Q${cx},${cy} ${cx + r},${cy} Q${cx},${cy} ${cx},${cy + r} Q${cx},${cy} ${cx - r},${cy} Q${cx},${cy} ${cx},${cy - r} Z" fill="#fffde7" stroke="#fbc02d" stroke-width="0.8"/>`

/** 포즈 공통: 발밑 기준으로 들썩·찌그러짐·기울임 */
const posed = (p, inner) =>
  g(`translate(48 ${88 + (p.dy ?? 0)}) rotate(${p.lean ?? 0}) scale(${p.sx ?? 1} ${p.sy ?? 1}) translate(-48 -88)`, inner, { opacity: p.opacity })

// ── 얼굴 ──
function eyes(p, lx, rx, y, size = 1) {
  const e = p.eyes ?? 'open'
  const s = size
  if (e === 'closed') return path(`M${lx - 4 * s},${y} Q${lx},${y + 3 * s} ${lx + 4 * s},${y}`, 'none') + path(`M${rx - 4 * s},${y} Q${rx},${y + 3 * s} ${rx + 4 * s},${y}`, 'none')
  if (e === 'squint') return path(`M${lx - 4 * s},${y - 3 * s} L${lx + 3 * s},${y} L${lx - 4 * s},${y + 3 * s}`, 'none') + path(`M${rx + 4 * s},${y - 3 * s} L${rx - 3 * s},${y} L${rx + 4 * s},${y + 3 * s}`, 'none')
  if (e === 'x') {
    const x = (cx) => path(`M${cx - 3 * s},${y - 3 * s} L${cx + 3 * s},${y + 3 * s} M${cx + 3 * s},${y - 3 * s} L${cx - 3 * s},${y + 3 * s}`, 'none')
    return x(lx) + x(rx)
  }
  if (e === 'spiral') {
    const sp = (cx) => path(`M${cx},${y} m-1,0 a1,1 0 1,1 2,0 a2,2 0 1,1 -4,0 a3,3 0 1,1 6,0 a4,4 0 1,1 -8,0`, 'none', { 'stroke-width': 1.6 })
    return sp(lx) + sp(rx)
  }
  if (e === 'angry') {
    return (
      ell(lx, y, 3 * s, 4 * s, OUT, { 'stroke-width': 0 }) +
      ell(rx, y, 3 * s, 4 * s, OUT, { 'stroke-width': 0 }) +
      path(`M${lx - 5 * s},${y - 7 * s} L${lx + 4 * s},${y - 4 * s}`, 'none') +
      path(`M${rx + 5 * s},${y - 7 * s} L${rx - 4 * s},${y - 4 * s}`, 'none')
    )
  }
  const one = (cx) => ell(cx, y, 3.2 * s, 4.2 * s, OUT, { 'stroke-width': 0 }) + circ(cx + 1.2 * s, y - 1.6 * s, 1.3 * s, '#fff', { 'stroke-width': 0 })
  return one(lx) + one(rx)
}
function mouth(p, x, y, w = 4) {
  const m = p.mouth ?? 'smile'
  if (m === 'open') return ell(x, y + 1, w * 0.8, w * 0.9, '#c2185b', { 'stroke-width': 2 })
  if (m === 'flat') return path(`M${x - w},${y} L${x + w},${y}`, 'none', { 'stroke-width': 2 })
  return path(`M${x - w},${y} Q${x},${y + w * 0.9} ${x + w},${y}`, 'none', { 'stroke-width': 2 })
}

// ── 캐릭터: 헬멧 쓴 사람 (정면) — 2026-11-27 ──
// 헬멧 색 = 능력치 점수 등급 6가지 (packages/defense/src/roster.ts STAT_TIERS 와 같은 색)
// 특수능력 = 손에 든 도구 (따로 그린 겹 그림 tool_*, 게임에서 몸 위에 겹쳐 그림)
/** 색은 모두 T()를 거침 → 맞음(하양)·얼음(하늘색) 물들이기 */
const tinter = (p) => (c) => (p.tint ? mix(c, p.tint[0], p.tint[1]) : c)

const SKIN = '#ffe0bd'
/** 오른팔(공격하는 팔)의 회전: 도구도 같은 회전으로 그려서 손에 붙어 다님 */
const armRot = (p) => `rotate(${-15 - (p.armUp ?? 0) * 120} 67 62)`

function human(h, p) {
  const T = tinter(p)
  const helmet = T(h.helmet)
  const dark = T(mix(h.helmet, '#000000', 0.3))
  const light = T(mix(h.helmet, '#ffffff', 0.5))
  let s = ''
  // 발·몸통(흰 옷 + 헬멧 색 옷깃·허리띠)
  s += ell(39, 85, 7.5, 4.5, T('#5d4037')) + ell(57, 85, 7.5, 4.5, T('#5d4037'))
  s += path('M31,62 Q48,55 65,62 L67,84 Q48,89 29,84 Z', T('#eceff1'))
  s += path('M31,76 Q48,80 66,76', 'none', { stroke: T('#6d4c41'), 'stroke-width': 3.5 })
  s += path('M38,60 L48,69 L58,60', 'none', { stroke: helmet, 'stroke-width': 3.5 })
  // 왼팔 · 오른팔(공격 때 듦)
  s += ell(29, 70, 5.5, 8, T(SKIN), { transform: 'rotate(15 29 70)' })
  s += ell(67, 70, 5.5, 8, T(SKIN), { transform: armRot(p) })
  // 머리 + 헬멧
  s += circ(48, 41, 22, T(SKIN))
  if (h.rainbow) {
    // 무지개 헬멧: 빨주노초파남보 줄무늬 (맞음·얼음 물들이기는 위에 반투명으로 덮음)
    s += '<defs><linearGradient id="rainbow" x1="0" y1="0" x2="1" y2="0.35">' +
      ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#3d5afe', '#d500f9'].map((c, i) => `<stop offset="${i / 6}" stop-color="${c}"/>`).join('') +
      '</linearGradient></defs>'
    s += path('M25,41 Q24,14 48,13 Q72,14 71,41 Z', 'url(#rainbow)')
    if (p.tint) s += path('M25,41 Q24,14 48,13 Q72,14 71,41 Z', p.tint[0], { opacity: p.tint[1], 'stroke-width': 0 })
  } else s += path('M25,41 Q24,14 48,13 Q72,14 71,41 Z', helmet)
  s += `<rect x="22" y="37" width="52" height="7" rx="3.5" fill="${dark}" stroke="${OUT}" stroke-width="${SW}"/>`
  s += path('M32,27 Q36,19 45,17', 'none', { stroke: '#ffffff', 'stroke-width': 3, opacity: 0.6 })
  // 헬멧 장식: 이마의 동그란 링 ○ (2026-11-27 별 → 줄 → 링, 사용자 선택). 잘 보이게 검은 테두리 위에 밝은 굵은 링
  s += circ(48, 27, 6.5, 'none', { 'stroke-width': 6 }) + circ(48, 27, 6.5, 'none', { stroke: light, 'stroke-width': 3.5 })
  // 무지개 헬멧 반짝임: 네 갈래 반짝이 (별 대신)
  if (h.sparkle) s += twinkle(70, 14, 5) + twinkle(24, 20, 3.5)
  // 얼굴
  s += eyes(p, 41, 52, 50, 0.9)
  s += ell(35, 56, 3.5, 2.2, T('#f48fb1'), { 'stroke-width': 0, opacity: 0.55 }) + ell(61, 56, 3.5, 2.2, T('#f48fb1'), { 'stroke-width': 0, opacity: 0.55 })
  s += mouth(p, 48, 57, 3)
  let out = posed(p, s)
  if (p.fx) out += p.fx
  return out
}

/** 헬멧 색 6등급 (roster.ts STAT_TIERS) */
const TIERS = [
  { id: 'unit_t1', name: '흰색 헬멧 (능력치 하)', helmet: '#f5f5f5' },
  { id: 'unit_t2', name: '노랑 헬멧', helmet: '#fdd835' },
  { id: 'unit_t3', name: '초록 헬멧', helmet: '#43a047' },
  { id: 'unit_t4', name: '파랑 헬멧', helmet: '#1e88e5' },
  { id: 'unit_t5', name: '보라 헬멧', helmet: '#8e24aa' },
  { id: 'unit_t6', name: '무지개 헬멧 (능력치 최상)', helmet: '#7c4dff', rainbow: true, sparkle: true },
]

/** 특수능력 도구 (손 기준 좌표: 손 = 0,0 / 위쪽 = 음수). 오른팔과 같이 돌아감 */
const TOOLS = {
  stun: { name: '뿅망치 — 스턴', draw: (T) => path('M0,2 L8,-20', 'none', { stroke: T('#ffca28'), 'stroke-width': 4 }) + `<rect x="0" y="-31" width="18" height="11" rx="4" transform="rotate(20 9 -25)" fill="${T('#e53935')}" stroke="${OUT}" stroke-width="${SW}"/>` },
  splash: { name: '폭탄 — 광역공격', draw: (T) => circ(4, -7, 8, T('#37474f')) + path('M8,-14 Q10,-20 15,-21', 'none', { stroke: T('#8d6e63'), 'stroke-width': 2 }) + star(16, -23, 4, T('#ffeb3b')) + circ(1, -10, 2, '#ffffff', { 'stroke-width': 0, opacity: 0.6 }) },
  crit: { name: '칼 — 2배 데미지', draw: (T) => path('M1,-5 L9,-33 L12,-31 L5,-4 Z', T('#eceff1')) + path('M-4,-6 L9,-2', 'none', { stroke: T('#ffb300'), 'stroke-width': 4 }) + circ(0, 2, 2.5, T('#ffb300')) },
  obstacle: { name: '삽 — 장애물 추가', draw: (T) => path('M0,3 L7,-20', 'none', { stroke: T('#8d6e63'), 'stroke-width': 3.5 }) + path('M3,-20 L13,-17 L11,-29 Q8,-34 4,-30 Z', T('#90a4ae')) },
  recall: { name: '마법봉 — 출발지로 보내기', draw: (T) => path('M0,4 L6,-18', 'none', { stroke: T('#f8bbd0'), 'stroke-width': 3.5 }) + star(7, -23, 7.5, T('#ff80ab')) + star(15, -31, 2.5, T('#fff59d')) + star(-1, -30, 2, T('#fff59d')) }, // 2026-11-27 부메랑 대신
  teamLevel: { name: '깃발 — 아군 전체 레벨업', draw: (T) => path('M0,4 L6,-32', 'none', { stroke: T('#6d4c41'), 'stroke-width': 3 }) + path('M6,-32 L26,-26 L4,-19 Z', T('#e53935')) },
  allAttack: { name: '수정구 지팡이 — 전체 공격', draw: (T) => path('M0,6 L7,-24', 'none', { stroke: T('#5d4037'), 'stroke-width': 3.5 }) + path('M3,-22 L11,-22', 'none', { stroke: T('#ffc107'), 'stroke-width': 3 }) + circ(8, -30, 7, T('#4fc3f7')) + circ(6, -32, 2.2, '#ffffff', { 'stroke-width': 0, opacity: 0.8 }) }, // 2026-11-27 마법봉과 헷갈리지 않게
  hawkeye: { name: '활 — 호크아이', draw: (T) => path('M-2,4 Q16,-14 -2,-34', 'none', { stroke: T('#8d6e63'), 'stroke-width': 3.5 }) + path('M-2,4 L-2,-34', 'none', { stroke: T('#eceff1'), 'stroke-width': 1.2 }) + path('M-6,-15 L20,-15 M16,-19 L21,-15 L16,-11', 'none', { stroke: T('#455a64'), 'stroke-width': 2 }) },
  hypnosis: { name: '최면 추 — 최면', draw: (T) => path('M2,4 L2,-30', 'none', { stroke: T('#8d6e63'), 'stroke-width': 2.5 }) + path('M2,-30 L14,-8', 'none', { stroke: T('#eceff1'), 'stroke-width': 1.5 }) + circ(15, -6, 6.5, T('#ab47bc')) + path('M15,-6 m-3.5,0 a3.5,3.5 0 1,1 3.5,3.5 a2,2 0 1,1 -2,-2', 'none', { stroke: T('#f3e5f5'), 'stroke-width': 1.5 }) },
  // 불꽃은 팔과 같이 기울면 어색해서 각도 고정 (fixed, 2026-11-28)
  frenzy: { name: '불꽃 — 광폭화', fixed: true, draw: (T) => path('M5,2 Q-6,-8 0,-20 Q2,-12 6,-14 Q4,-26 12,-34 Q12,-22 18,-16 Q22,-6 13,2 Z', T('#ff5722')) + path('M7,0 Q1,-6 5,-13 Q7,-8 10,-10 Q12,-4 9,0 Z', T('#ffeb3b'), { 'stroke-width': 1.5 }) },
  boostAll: { name: '황금 방패 — 전체 강화', draw: (T) => path('M-4,-30 L16,-30 Q17,-14 6,-4 Q-5,-14 -4,-30 Z', T('#ffc107')) + path('M6,-27 L6,-8 M-1,-21 L13,-21', 'none', { stroke: T('#fff8e1'), 'stroke-width': 2.5 }) },
  poison: { name: '독 병 — 맹독', draw: (T) => `<rect x="1" y="-20" width="6" height="7" rx="1.5" fill="${T('#d7ccc8')}" stroke="${OUT}" stroke-width="2"/>` + circ(4, -6, 8, T('#ab47bc')) + circ(1, -8, 1.8, '#ffffff', { 'stroke-width': 0, opacity: 0.7 }) + circ(7, -4, 1.3, '#f3e5f5', { 'stroke-width': 0 }) },
  // 2026-11-28 추가 (spec 13~16)
  // 2026-11-28 날을 바깥(오른쪽)으로
  instakill: { name: '낫 — 즉사', draw: (T) => path('M-1,6 L7,-32', 'none', { stroke: T('#5d4037'), 'stroke-width': 3.5 }) + path('M7,-32 Q22,-37 27,-21 Q19,-28 9,-25 Z', T('#cfd8dc')) + path('M22,-24 Q17,-29 12,-27', 'none', { stroke: '#ffffff', 'stroke-width': 1.2 }) },
  iceTile: { name: '눈꽃 지팡이 — 빙결', draw: (T) => path('M0,5 L6,-20', 'none', { stroke: T('#90caf9'), 'stroke-width': 3.5 }) + path('M8,-38 L8,-20 M0,-33.5 L16,-24.5 M0,-24.5 L16,-33.5', 'none', { stroke: OUT, 'stroke-width': 5 }) + path('M8,-38 L8,-20 M0,-33.5 L16,-24.5 M0,-24.5 L16,-33.5', 'none', { stroke: T('#b3e5fc'), 'stroke-width': 2.6 }) + circ(8, -29, 3, T('#4fc3f7')) },
  lullaby: { name: '마이크 — 자장가', draw: (T) => `<rect x="1" y="-16" width="6" height="19" rx="2" fill="${T('#424242')}" stroke="${OUT}" stroke-width="2"/>` + circ(4, -22, 7.5, T('#b0bec5')) + path('M-2,-25 L10,-25 M-2,-21 L10,-21 M1,-28 L1,-17 M7,-28 L7,-17', 'none', { stroke: T('#78909c'), 'stroke-width': 1.1 }) + path('M15,-30 L15,-38 L20,-39 L20,-31', 'none', { stroke: T('#4fc3f7'), 'stroke-width': 1.6 }) + circ(13.8, -30, 1.8, T('#4fc3f7'), { 'stroke-width': 1 }) + circ(18.8, -31, 1.8, T('#4fc3f7'), { 'stroke-width': 1 }) },
  agiCopy: { name: '거울 — 민첩 복사', draw: (T) => `<rect x="2" y="-15" width="5" height="19" rx="2.5" transform="rotate(8 4.5 -5)" fill="${T('#ffb300')}" stroke="${OUT}" stroke-width="2"/>` + circ(4, -14, 3, T('#ffb300'), { 'stroke-width': 2 }) + ell(6, -27, 10, 12, T('#ffc107')) + ell(6, -27, 6.5, 8.5, T('#e0f7fa'), { 'stroke-width': 0 }) + path('M2,-31 L6,-35 M2.5,-26 L4.5,-28', 'none', { stroke: '#ffffff', 'stroke-width': 1.8 }) },
}

/** 도구 한 장 (몸과 같은 포즈 → 같은 자리에 겹치면 손에 붙음) */
/** fixed 도구(불꽃)는 팔 회전·몸 기울기를 따르지 않고 늘 대기 자세 각도 (들썩임은 따름) */
const toolLayer = (kind, p) => {
  const fixed = TOOLS[kind].fixed
  return posed(fixed ? { ...p, lean: 0 } : p, g(fixed ? armRot({}) : armRot(p), g('translate(67 77) scale(1.45)', TOOLS[kind].draw(tinter(p)))))
}

const burst = (x, y, s = 1) => twinkle(x, y, 11 * s) + twinkle(x + 9 * s, y - 8 * s, 4 * s) // 2026-11-27 별 대신 반짝이
const iceBlock = `<rect x="12" y="6" width="72" height="84" rx="12" fill="#b3e5fc" fill-opacity="0.5" stroke="#e1f5fe" stroke-width="3"/><path d="M22,20 L34,12 M24,32 L40,18 M70,70 L78,62" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>`

const UNIT_MOTIONS = {
  idle: {
    fps: 6,
    loop: true,
    frames: [{ dy: 0 }, { dy: -1, sy: 1.01 }, { dy: -2, sy: 1.02 }, { dy: -2, sy: 1.02 }, { dy: -1, eyes: 'closed' }, { dy: 0 }],
  },
  attack: {
    fps: 12,
    loop: false,
    frames: [
      { sx: 1.08, sy: 0.92, lean: -6, eyes: 'squint', mouth: 'flat' },
      { dy: -7, sx: 0.94, sy: 1.08, lean: 8, mouth: 'open', armUp: 1 },
      { dy: -5, lean: 10, mouth: 'open', armUp: 0.8, fx: burst(78, 24, 1.8) },
      { dy: -1, lean: 3, armUp: 0.2 },
    ],
  },
  frozen: { fps: 1, loop: true, frames: [{ eyes: 'closed', mouth: 'flat', tint: ['#b3e5fc', 0.45], fx: iceBlock }] },
}

// ── 몬스터: 슬라임 1종 + 소품(옷)으로 특성 구분 (2026-11-27 확정) ──
// 오른쪽을 보고 그림. 소품은 겹 3개: back(몸 뒤) · face(몸 위, 눈 아래) · front(맨 앞)
// p.phase = 걷기 프레임 번호(0~5) → 날개·망토·목도리가 흔들림
function slimeBody(p, body) {
  let s = path('M22,88 Q11,88 11,76 Q10,44 48,36 Q86,44 85,76 Q85,88 74,88 Z', body) // 아래 양쪽 모서리를 둥글게 (2026-11-27)
  s += path('M24,52 Q30,44 40,42', 'none', { stroke: '#ffffff', 'stroke-width': 3, opacity: 0.7 })
  return s
}
const slimeFace = (p) => eyes(p, 54, 70, 60) + mouth(p, 63, 70, 4)

/** 소품 그리기. T = 물들이기(맞음·얼음) */
const ACCESSORIES = {
  plain: () => ({}),
  cape: (p, T) => {
    const c = '#7b1fa2'
    // 몸 왼쪽(등)을 덮고 펄럭이는 망토. 프레임 밖(x<4)으로 안 나가게
    const f = [0, 1, 2, 1, 0, -1][p.phase ?? 0]
    return {
      face:
        path(`M48,43 Q26,48 ${7 - f},${86 - f} L40,88 Q34,66 52,45 Z`, T(c)) +
        path(`M44,52 Q30,64 ${16 - f},84`, 'none', { stroke: T(mix(c, '#000000', 0.3)), 'stroke-width': 1.8 }),
      front: circ(49, 45, 3.5, T('#ffca28')),
    }
  },
  hat: (p, T) => ({
    front:
      path(`M62,38 Q70,${14 + ((p.phase ?? 0) % 2) * 2} 90,8 Q84,26 70,40 Z`, T('#e53935')) +
      ell(50, 44, 25, 4.5, T('#1b5e20')) +
      path('M30,43 Q44,16 70,42 Z', T('#2e7d32')),
  }),
  helmet: (p, T) => ({
    front:
      path('M17,54 Q17,27 48,25 Q79,27 80,54 Z', T('#cfd8dc')) +
      `<rect x="15" y="49" width="67" height="7" rx="3" fill="${T('#90a4ae')}" stroke="${OUT}" stroke-width="${SW}"/>` +
      path('M48,25 L48,16', 'none', { stroke: T('#e53935'), 'stroke-width': 5 }) +
      circ(28, 52, 1.6, OUT, { 'stroke-width': 0 }) +
      circ(68, 52, 1.6, OUT, { 'stroke-width': 0 }),
  }),
  backpack: (p, T) => ({
    back:
      `<rect x="3" y="48" width="21" height="30" rx="6" fill="${T('#6d4c41')}" stroke="${OUT}" stroke-width="${SW}"/>` +
      path('M3,58 L24,58', 'none', { 'stroke-width': 2 }),
    face: path('M24,50 Q40,58 44,84', 'none', { stroke: T('#4e342e'), 'stroke-width': 4 }),
  }),
  armor: (p, T) => ({
    face:
      path('M26,76 Q50,70 82,76 L80,88 L28,88 Z', T('#b0bec5')) +
      path('M54,72 L54,88', 'none', { 'stroke-width': 1.5 }) +
      ell(22, 70, 9, 7, T('#90a4ae')) +
      circ(40, 81, 1.6, OUT, { 'stroke-width': 0 }) +
      circ(68, 81, 1.6, OUT, { 'stroke-width': 0 }),
  }),
  wings: (p, T) => {
    const f = (p.phase ?? 0) % 2
    return {
      back:
        ell(26, 40 - f * 4, 17, 9, T('#ffffff'), { transform: `rotate(${-30 - f * 20} 34 50)` }) +
        ell(34, 30 - f * 4, 15, 8, T('#e3f2fd'), { transform: `rotate(${-60 - f * 20} 40 46)` }),
    }
  },
  ribbon: (p, T) => ({
    front: path('M38,40 L24,30 L26,48 Z', T('#e91e63')) + path('M38,40 L52,28 L54,46 Z', T('#e91e63')) + circ(38, 40, 4.5, T('#f06292')),
  }),
  scarf: (p, T) => {
    const f = [0, 2, 4, 2, 0, -2][p.phase ?? 0]
    return {
      face:
        path(`M22,70 L${10 - f},86 L20,88 L30,74 Z`, T('#1565c0')) +
        path('M14,66 Q48,77 84,66 L85,74 Q48,85 13,74 Z', T('#1e88e5')) +
        path('M30,70 L32,78 M46,72 L46,80 M62,72 L60,80', 'none', { stroke: T('#ffffff'), 'stroke-width': 2.5 }),
      front: star(80, 40, 5, T('#e1f5fe')),
    }
  },
  flower: (p, T) => {
    let s = ''
    for (let k = 0; k < 5; k++) {
      const a = (Math.PI * 2 * k) / 5
      s += circ(38 + Math.cos(a) * 6, 36 + Math.sin(a) * 6, 5, T('#f48fb1'))
    }
    return { front: s + circ(38, 36, 4, T('#ffeb3b')) + path('M44,42 Q50,46 54,44', 'none', { stroke: T('#43a047'), 'stroke-width': 3 }) }
  },
  mushroom: (p, T) => ({
    front:
      path('M8,52 Q10,14 48,13 Q86,14 88,52 Q48,60 8,52 Z', T('#e53935')) +
      circ(28, 34, 5, T('#ffffff'), { 'stroke-width': 0 }) +
      circ(50, 24, 6, T('#ffffff'), { 'stroke-width': 0 }) +
      circ(70, 36, 5, T('#ffffff'), { 'stroke-width': 0 }) +
      circ(42, 44, 3.5, T('#ffffff'), { 'stroke-width': 0 }),
  }),
  sneakers: (p, T) => {
    const f = [2, 1, 0, -1, -2, -1][p.phase ?? 0]
    const shoe = (x) => ell(x, 87, 12, 6.5, T('#e53935')) + path(`M${x - 11},90 L${x + 11},90`, 'none', { stroke: T('#ffffff'), 'stroke-width': 2.5 })
    return {
      front: shoe(32 + f * 2) + shoe(64 - f * 2) + path('M14,58 L5,56 M14,66 L5,66', 'none', { stroke: T('#ffffff'), 'stroke-width': 2.5, opacity: 0.8 }),
    }
  },
  spring: (p, T) => {
    // 몸 아래에 튀어나온 큰 용수철 두 개 (앞에 그려서 잘 보이게)
    const coil = (x) =>
      path(`M${x - 8},80 L${x + 8},83 L${x - 8},86 L${x + 8},89 L${x - 8},92 L${x + 8},95`, 'none', { stroke: OUT, 'stroke-width': 5 }) +
      path(`M${x - 8},80 L${x + 8},83 L${x - 8},86 L${x + 8},89 L${x - 8},92 L${x + 8},95`, 'none', { stroke: T('#cfd8dc'), 'stroke-width': 2.5 })
    return { front: coil(30) + coil(66) }
  },
  halo: (p, T) => ({
    front: ell(48, 22, 17, 5, 'none', { stroke: T('#ffca28'), 'stroke-width': 4.5 }) + ell(48, 22, 17, 5, 'none', { stroke: '#fff59d', 'stroke-width': 1.5 }),
  }),
  fan: (p, T) => {
    const a = (p.phase ?? 0) % 2 ? 6 : 0
    return {
      front: g(
        `rotate(${a} 80 74)`,
        path('M80,74 L62,52 Q78,38 94,54 Z', T('#ef5350')) +
          path('M80,74 L70,46 M80,74 L80,44 M80,74 L90,48', 'none', { stroke: T('#ffffff'), 'stroke-width': 1.8 }) +
          path('M80,74 L84,84', 'none', { stroke: T('#6d4c41'), 'stroke-width': 4 }),
      ),
    }
  },
  brush: (p, T) => ({
    front:
      path('M92,48 L72,80', 'none', { stroke: T('#8d6e63'), 'stroke-width': 5 }) +
      path('M74,77 Q64,86 68,92 Q76,90 77,81 Z', T('#212121')) +
      circ(58, 90, 2.5, T('#212121'), { 'stroke-width': 0 }) +
      circ(86, 92, 2, T('#212121'), { 'stroke-width': 0 }),
  }),
  // 소라 껍데기를 등에 짊어짐 (맞으면 숨는 느낌) — 부채와 모양이 겹치지 않게 등 쪽
  shell: (p, T) => ({
    back:
      path('M8,14 L18,26 Q4,36 8,52 Q14,64 30,62 Q44,58 42,42 Q40,26 22,24 Z', T('#ffab91')) +
      path('M24,32 Q36,32 35,44 Q33,54 23,53 Q15,51 16,43 Q18,37 25,39 Q30,41 28,46', 'none', { stroke: T('#e64a19'), 'stroke-width': 2.2 }),
  }),
  mask: (p, T) => ({
    face:
      `<rect x="42" y="53" width="40" height="14" rx="6" fill="${T('#263238')}" stroke="${OUT}" stroke-width="${SW}"/>` +
      path('M42,58 L32,54 M42,62 L30,64', 'none', { stroke: T('#263238'), 'stroke-width': 3 }) +
      ell(54, 60, 5, 5.5, '#ffffff', { 'stroke-width': 0 }) +
      ell(70, 60, 5, 5.5, '#ffffff', { 'stroke-width': 0 }),
  }),
  glasses: () => ({
    front:
      circ(54, 60, 7.5, 'none', { 'stroke-width': 2.5 }) +
      circ(70, 60, 7.5, 'none', { 'stroke-width': 2.5 }) +
      path('M61.5,60 L62.5,60 M46.5,59 L38,56', 'none', { 'stroke-width': 2.5 }),
  }),
  // 속도: 스케이트보드 (2026-11-27 운동화 대신). 걸을 때 보드가 살짝 기울고 뒤로 바람 줄
  skateboard: (p, T) => {
    const tilt = [0, -2, -3, -2, 0, 1][p.phase ?? 0]
    return {
      back: path('M14,56 L4,54 M14,64 L3,64 M16,72 L6,74', 'none', { stroke: T('#ffffff'), 'stroke-width': 2.5, opacity: 0.8 }),
      front: g(
        `rotate(${tilt} 48 90)`,
        `<rect x="10" y="86" width="76" height="6" rx="3" fill="${T('#ef6c00')}" stroke="${OUT}" stroke-width="${SW}"/>` +
          path('M20,89 L76,89', 'none', { stroke: T('#ffcc80'), 'stroke-width': 1.5 }) +
          circ(24, 96, 3.8, T('#455a64')) +
          circ(72, 96, 3.8, T('#455a64')),
      ),
    }
  },
  // 우두머리 모자: 높은 모자 앞에 "BOSS" (글꼴 없이 선으로 그림 — 다른 컴퓨터에서도 같게)
  kingHat: (p, T, ctx) => {
    // 투구 위에 쓰면 12 만큼 위로
    const up = ctx?.acc.includes('helmet') ? 12 : 0
    const x = 48
    const y = 23 - up
    const ink = { stroke: T('#ffe082'), 'stroke-width': 1.8, fill: 'none' }
    // "BOSS" (2026-11-28, 예전 "왕"): 글자 하나 폭 6, 간격 1.6, 높이 11
    const t = y - 8
    const btm = y + 3
    const m = (t + btm) / 2
    const L = (i) => 48 - (4 * 6 + 3 * 1.6) / 2 + i * 7.6
    const letterB = (l) => path(`M${l},${t} L${l},${btm} M${l},${t} L${l + 3.4},${t} Q${l + 5.8},${t} ${l + 5.8},${t + 2.7} Q${l + 5.8},${m} ${l + 3.4},${m} L${l},${m} M${l + 3.4},${m} Q${l + 6.2},${m} ${l + 6.2},${m + 2.8} Q${l + 6.2},${btm} ${l + 3.4},${btm} L${l},${btm}`, 'none', ink)
    const letterO = (l) => ell(l + 3, m, 3, 5.5, 'none', ink)
    const letterS = (l) => path(`M${l + 5.6},${t + 1.4} Q${l + 4.6},${t} ${l + 3},${t} Q${l + 0.3},${t} ${l + 0.3},${t + 2.6} Q${l + 0.3},${m} ${l + 3},${m} Q${l + 5.8},${m} ${l + 5.8},${m + 2.7} Q${l + 5.8},${btm} ${l + 3},${btm} Q${l + 1},${btm} ${l + 0.2},${btm - 1.4}`, 'none', ink)
    const wang = letterB(L(0)) + letterO(L(1)) + letterS(L(2)) + letterS(L(3))
    return {
      front:
        ell(48, 41 - up, 25, 5.5, T('#1a237e')) +
        `<rect x="30" y="${6 - up}" width="36" height="35" rx="5" fill="${T('#283593')}" stroke="${OUT}" stroke-width="${SW}"/>` +
        `<rect x="30" y="${31 - up}" width="36" height="6" fill="${T('#ffc107')}" stroke="${OUT}" stroke-width="1.5"/>` +
        // 게임이 좌우로 뒤집어 그릴 때 쓰는 그림(_m)은 글자만 미리 뒤집어 둠 → 화면에선 늘 바른 "BOSS"
        (ctx?.mirrorText ? `<g transform="matrix(-1 0 0 1 96 0)">${wang}</g>` : wang),
    }
  },
  plume: (p, T, ctx) => {
    const wave = ((p.phase ?? 0) % 2) * 2
    const king = ctx?.acc.includes('kingHat')
    const up = king && ctx?.acc.includes('helmet') ? 12 : 0
    // 왕 모자면 모자 옆 띠에, 투구면 투구 꼭대기 옆에 꽂음
    const [bx, by] = king ? [64, 30 - up] : [58, 26]
    return { front: path(`M${bx},${by} Q${bx + 8},${by - 16 + wave} ${bx + 24},${by - 22} Q${bx + 16},${by - 8} ${bx + 4},${by + 3} Z`, T('#e53935')) }
  },
  crown: (p, T) => ({
    front:
      path('M30,42 L31,20 L40,31 L48,15 L56,31 L65,20 L66,42 Z', T('#ffc107')) +
      circ(48, 34, 3, T('#e53935')) +
      circ(37, 37, 2.2, T('#42a5f5')) +
      circ(59, 37, 2.2, T('#42a5f5')),
  }),
}

/** 소품을 입은 슬라임 한 장 */
function dressedSlime(p, m) {
  const T = tinter(p)
  const ctx = { acc: m.acc, mirrorText: m.mirrorText }
  const parts = m.acc.map((a) => ACCESSORIES[a](p, T, ctx))
  const layer = (k) => parts.map((x) => x[k] ?? '').join('')
  return layer('back') + slimeBody(p, T(m.body)) + layer('face') + slimeFace(p) + layer('front')
}

const stunStars = (i) => {
  let s = ''
  for (let k = 0; k < 3; k++) {
    const a = (Math.PI * 2 * k) / 3 + (i * Math.PI) / 6
    s += star(48 + Math.cos(a) * 20, 18 + Math.sin(a) * 6, 5, '#ffeb3b')
  }
  return s
}
const puff = (i) => {
  let s = ''
  for (let k = 0; k < 5; k++) {
    const a = (Math.PI * 2 * k) / 5
    const r = 14 + i * 8
    s += circ(48 + Math.cos(a) * r, 64 + Math.sin(a) * r * 0.6, 7 - i, '#eeeeee', { 'stroke-width': 0, opacity: 1 - i * 0.18 })
  }
  return s
}

function monsterMotions(extraWalk) {
  return {
    walk: {
      fps: 10,
      loop: true,
      frames: [
        { sy: 1, ...extraWalk(0) },
        { sy: 0.92, sx: 1.05, ...extraWalk(1) },
        { sy: 0.88, sx: 1.08, ...extraWalk(2) },
        { sy: 1.0, dy: -3, ...extraWalk(3) },
        { sy: 1.08, sx: 0.95, dy: -6, ...extraWalk(4) },
        { sy: 1.04, dy: -3, ...extraWalk(5) },
      ],
    },
    hit: {
      fps: 12,
      loop: false,
      frames: [
        { tint: ['#ffffff', 0.75], sx: 1.1, sy: 0.88, eyes: 'squint', mouth: 'open', lean: -6 },
        { tint: ['#ffffff', 0.35], sx: 0.96, sy: 1.04, eyes: 'squint', lean: -2 },
      ],
    },
    stun: {
      fps: 8,
      loop: true,
      frames: [0, 1, 2, 3].map((i) => ({ eyes: 'spiral', mouth: 'flat', lean: [-6, 0, 6, 0][i], fx: stunStars(i) })),
    },
    die: {
      fps: 12,
      loop: false,
      frames: [0, 1, 2, 3, 4].map((i) => ({
        eyes: 'x',
        mouth: 'open',
        sy: 1 - i * 0.17,
        sx: 1 + i * 0.08,
        tint: ['#9e9e9e', 0.15 + i * 0.15],
        opacity: 1 - i * 0.18,
        fx: i >= 1 ? puff(i - 1) : '',
      })),
    },
  }
}

/**
 * 몬스터 12종 (게임에 나옴): 슬라임 + 높은 능력치의 소품 (2026-11-27)
 * 체력 = 배낭, 방어 = 갑옷, 민첩 = 깃털 모자, 속도 = 운동화 → 두 가지 높은 종류는 소품 두 개
 * 몸 색은 packages/defense/src/stages.ts 의 MONSTER_BASES 와 같게
 */
/** 소품 겹치는 순서 (뒤 → 앞) */
const ACC_ORDER = ['cape', 'backpack', 'armor', 'sneakers', 'skateboard', 'hat', 'helmet', 'crown', 'kingHat', 'plume']
const TRAIT_ACC = { hp: 'backpack', armor: 'helmet', agi: 'hat', spd: 'skateboard' }
const GAME_MONSTERS = {
  normal: { name: '보통', body: '#7cb342', traits: [] },
  hp: { name: '튼튼이 (체력)', body: '#a1887f', traits: ['hp'] },
  armor: { name: '단단이 (방어)', body: '#90a4ae', traits: ['armor'] },
  agi: { name: '날렵이 (민첩)', body: '#4db6ac', traits: ['agi'] },
  spd: { name: '날쌘돌이 (속도)', body: '#ffd54f', traits: ['spd'] },
  hp_armor: { name: '철벽이 (체력·방어)', body: '#78909c', traits: ['hp', 'armor'] },
  hp_agi: { name: '끈질이 (체력·민첩)', body: '#81c784', traits: ['hp', 'agi'] },
  hp_spd: { name: '돌진이 (체력·속도)', body: '#ff8a65', traits: ['hp', 'spd'] },
  armor_agi: { name: '방패꾼 (방어·민첩)', body: '#9575cd', traits: ['armor', 'agi'] },
  armor_spd: { name: '기사 (방어·속도)', body: '#64b5f6', traits: ['armor', 'spd'] },
  agi_spd: { name: '바람이 (민첩·속도)', body: '#f06292', traits: ['agi', 'spd'] },
  boss: { name: '우두머리 (왕 모자 + 망토)', body: '#e53935', traits: [], extra: ['cape', 'kingHat'] },
}
/** 특성 → 입을 소품. 머리(투구·왕 모자)를 쓰면 민첩은 깃털 모자 대신 깃털 장식 */
function accFor(traits, extra = []) {
  const acc = [...traits.map((t) => TRAIT_ACC[t]), ...extra]
  const headTaken = acc.includes('helmet') || acc.includes('kingHat')
  const out = acc.map((a) => (a === 'hat' && headTaken ? 'plume' : a))
  return [...new Set(out)].sort((x, y) => ACC_ORDER.indexOf(x) - ACC_ORDER.indexOf(y))
}

/** 우두머리: 탄마다 섞는 특성(3개 이상)에 따라 그림이 다름 → 조합마다 한 장 (mon_boss_hp_armor_agi 등) */
const TRAIT_ORDER = ['hp', 'armor', 'agi', 'spd']
const BOSS_COMBOS = [
  ['hp', 'armor', 'agi'],
  ['hp', 'armor', 'spd'],
  ['hp', 'agi', 'spd'],
  ['armor', 'agi', 'spd'],
  ['hp', 'armor', 'agi', 'spd'],
]
const TRAIT_KO = { hp: '체력', armor: '방어', agi: '민첩', spd: '속도' }

const MONSTERS = Object.fromEntries([
  ...Object.entries(GAME_MONSTERS).map(([id, m]) => [`mon_${id}`, { name: m.name, body: m.body, acc: accFor(m.traits, m.extra) }]),
  ...BOSS_COMBOS.map((c) => [
    `mon_boss_${c.join('_')}`,
    { name: `우두머리 (${c.map((t) => TRAIT_KO[t]).join('·')})`, body: '#e53935', acc: accFor(c, ['cape', 'kingHat']) },
  ]),
])
void TRAIT_ORDER
// 왕 모자를 쓴 그림은 "글자만 뒤집은" 짝(_m)도 만듦 (왼쪽으로 갈 때 사용)
for (const [id, m] of Object.entries(MONSTERS)) if (m.acc.includes('kingHat')) MONSTERS[`${id}_m`] = { ...m, name: `${m.name} (왼쪽용)`, mirrorText: true }

/** 몬스터 능력용 소품 시안 (아직 게임엔 안 씀 — "능력자" 표시용 후보) */
const ACC_SAMPLES = {
  acc_scarf: { name: '[시안] 목도리 — 얼리기', body: '#b3e5fc', acc: ['scarf'] },
  acc_flower: { name: '[시안] 꽃 머리핀 — 완전 회복', body: '#c5e1a5', acc: ['flower'] },
  acc_mushroom: { name: '[시안] 버섯 모자 — 전체 회복', body: '#ffe0b2', acc: ['mushroom'] },
  acc_wings: { name: '[시안] 날개 — 질주', body: '#fff176', acc: ['wings'] },
  acc_spring: { name: '[시안] 스프링 — 순간이동', body: '#9ccc65', acc: ['spring'] },
  acc_halo: { name: '[시안] 천사 고리 — 무적', body: '#e1bee7', acc: ['halo'] },
  acc_fan: { name: '[시안] 부채 — 날려 보내기', body: '#81d4fa', acc: ['fan'] },
  acc_brush: { name: '[시안] 먹물 붓 — 약화', body: '#9e9e9e', acc: ['brush'] },
  acc_shell: { name: '[시안] 소라 껍데기 — 단단해지기', body: '#ffccbc', acc: ['shell'] },
  acc_helmet: { name: '[시안] 투구', body: '#90a4ae', acc: ['helmet'] },
  acc_ribbon: { name: '[시안] 리본', body: '#f8bbd0', acc: ['ribbon'] },
  acc_mask: { name: '[시안] 복면', body: '#ba68c8', acc: ['mask'] },
  acc_glasses: { name: '[시안] 안경', body: '#fff59d', acc: ['glasses'] },
}

/** 별칭 (지금은 없음) */
export const ALIASES = {}

/** 모든 개체 목록 */
export function entities() {
  const list = []
  for (const t of TIERS) list.push({ id: t.id, name: t.name, kind: 'unit', motions: UNIT_MOTIONS, draw: (p) => human(t, p) })
  // 도구 겹 그림: 몸과 같은 모션(대기·공격·얼음) — 얼음 모션에선 게임이 도구를 몸 뒤에 그림
  for (const [kind, t] of Object.entries(TOOLS)) list.push({ id: `tool_${kind}`, name: t.name, kind: 'unit', motions: UNIT_MOTIONS, draw: (p) => toolLayer(kind, p) })
  for (const [id, m] of [...Object.entries(MONSTERS), ...Object.entries(ACC_SAMPLES)]) {
    list.push({
      id,
      name: m.name,
      kind: 'monster',
      motions: monsterMotions((i) => ({ phase: i })),
      draw: (p) => posed(p, dressedSlime(p, m)) + (p.fx ?? ''),
    })
  }
  return list
}
