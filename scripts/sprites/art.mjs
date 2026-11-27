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

// ── 캐릭터 (동물 8종, 정면) ──
/** 색은 모두 T()를 거침 → 맞음(하양)·얼음(하늘색) 물들이기 */
const tinter = (p) => (c) => (p.tint ? mix(c, p.tint[0], p.tint[1]) : c)

function animal(a, p) {
  const T = tinter(p)
  const body = T(a.body)
  const belly = T(a.belly)
  const dark = T(a.dark ?? mix(a.body, '#000000', 0.35))
  const back = []
  const front = []

  // 꼬리·등 뒤
  if (a.tail === 'bushy') back.push(path('M66,74 Q90,70 86,48 Q80,62 64,64 Z', body), path('M86,48 Q84,56 80,58 Q84,50 86,48 Z', T(a.tailTip ?? a.belly)))
  if (a.tail === 'tuft') back.push(path('M66,76 Q84,80 84,64', 'none', { stroke: body, 'stroke-width': 4 }), circ(84, 62, 5, T(a.mane)))
  if (a.tail === 'puff') back.push(circ(68, 78, 7, belly))
  if (a.shell) back.push(ell(48, 62, 27, 23, T(a.shell)), path('M30,56 L40,48 L56,48 L66,56 L56,66 L40,66 Z', 'none', { stroke: T(mix(a.shell, '#000000', 0.3)), 'stroke-width': 2 }))
  if (a.mane) {
    let m = ''
    for (let i = 0; i < 14; i++) {
      const ang = (Math.PI * 2 * i) / 14
      m += circ(48 + Math.cos(ang) * 25, 40 + Math.sin(ang) * 25, 9, T(a.mane), { 'stroke-width': 0 })
    }
    back.push(circ(48, 40, 30, T(a.mane)), m)
  }
  if (a.ears === 'pointy') {
    back.push(path('M29,30 L24,6 L44,20 Z', body), path('M32,26 L29,13 L40,21 Z', T(a.earIn ?? '#f8bbd0'), { 'stroke-width': 0 }))
    back.push(path('M67,30 L72,6 L52,20 Z', body), path('M64,26 L67,13 L56,21 Z', T(a.earIn ?? '#f8bbd0'), { 'stroke-width': 0 }))
    if (a.earTip) back.push(path('M24,6 L27,16 L31,12 Z', T(a.earTip), { 'stroke-width': 0 }), path('M72,6 L69,16 L65,12 Z', T(a.earTip), { 'stroke-width': 0 }))
  }
  if (a.ears === 'round') back.push(circ(29, 22, 9, body), circ(29, 22, 4.5, T(a.earIn ?? '#d7ccc8'), { 'stroke-width': 0 }), circ(67, 22, 9, body), circ(67, 22, 4.5, T(a.earIn ?? '#d7ccc8'), { 'stroke-width': 0 }))
  if (a.ears === 'long') {
    back.push(g('rotate(-12 38 24)', ell(38, 6, 7, 20, body) + ell(38, 8, 3.5, 14, T('#f48fb1'), { 'stroke-width': 0 })))
    back.push(g('rotate(12 58 24)', ell(58, 6, 7, 20, body) + ell(58, 8, 3.5, 14, T('#f48fb1'), { 'stroke-width': 0 })))
  }

  // 몸
  if (a.coil) {
    front.push(ell(48, 80, 26, 8, body), ell(48, 71, 21, 8, body), ell(48, 62, 15, 7, body))
    front.push(path('M26,80 Q48,86 70,80', 'none', { stroke: belly, 'stroke-width': 3 }))
  } else {
    front.push(ell(38, 83, 7.5, 4.5, a.feet ? T(a.feet) : dark), ell(58, 83, 7.5, 4.5, a.feet ? T(a.feet) : dark))
    front.push(ell(48, 66, 20, 17, body), ell(48, 70, 12, 10, belly, { 'stroke-width': 0 }))
    // 팔 (공격 때 오른팔을 듦)
    const up = p.armUp ?? 0
    if (a.wings) {
      front.push(ell(27, 64, 7, 13, dark, { transform: `rotate(${15 - up * 50} 27 56)` }), ell(69, 64, 7, 13, dark, { transform: `rotate(${-15 + up * 60} 69 56)` }))
    } else {
      front.push(ell(29, 66, 5.5, 7, body, { transform: 'rotate(15 29 66)' }), ell(67, 66, 5.5, 7, body, { transform: `rotate(${-15 - up * 120} 67 60)` }))
    }
  }

  // 머리
  front.push(circ(48, 40, 23, body))
  if (a.face) front.push(ell(48, 47, 15, 11, T(a.face), { 'stroke-width': 0 }))
  if (a.tuft) front.push(path('M44,18 Q46,8 50,16 Q54,8 54,19', body))
  front.push(eyes(p, 40, 56, 38))
  front.push(ell(34, 48, 4, 2.5, T('#f48fb1'), { 'stroke-width': 0, opacity: 0.55 }), ell(62, 48, 4, 2.5, T('#f48fb1'), { 'stroke-width': 0, opacity: 0.55 }))
  if (a.beak) {
    front.push(path('M42,45 L54,45 L48,55 Z', T('#ffb300')))
  } else if (a.snout) {
    front.push(ell(48, 49, 8, 6, T(a.snout), { 'stroke-width': 0 }))
    front.push(ell(48, 46, 3, 2.2, OUT, { 'stroke-width': 0 }))
    front.push(mouth(p, 48, 51, 3.5))
  } else {
    front.push(mouth(p, 48, 49, 3.5))
  }
  if (a.teeth) front.push(`<rect x="45.5" y="51" width="5" height="4" fill="#fff" stroke="${OUT}" stroke-width="1.2"/>`)
  if (a.tongue && (p.mouth === 'open' || p.armUp)) front.push(path('M48,52 L48,60 M48,60 L45,63 M48,60 L51,63', 'none', { stroke: '#e53935', 'stroke-width': 2 }))

  let out = posed(p, back.join('') + front.join(''))
  if (p.fx) out += p.fx
  return out
}

const ANIMALS = {
  img1: { name: '늑대', body: '#90a4ae', belly: '#eceff1', ears: 'pointy', snout: '#eceff1', tail: 'bushy', tailTip: '#eceff1' },
  img2: { name: '여우', body: '#ff8a65', belly: '#fff3e0', ears: 'pointy', earTip: '#4e342e', face: '#fff3e0', snout: '#fff3e0', tail: 'bushy', tailTip: '#ffffff' },
  img3: { name: '곰', body: '#a1887f', belly: '#d7ccc8', ears: 'round', snout: '#d7ccc8' },
  img4: { name: '매', body: '#8d6e63', belly: '#efebe9', face: '#efebe9', beak: true, wings: true, tuft: true, feet: '#ffb300' },
  img5: { name: '뱀', body: '#81c784', belly: '#e8f5e9', coil: true, tongue: true },
  img6: { name: '사자', body: '#ffb74d', belly: '#fff3e0', ears: 'round', earIn: '#ffe0b2', mane: '#e65100', snout: '#fff3e0', tail: 'tuft' },
  img7: { name: '거북', body: '#4db6ac', belly: '#e0f2f1', shell: '#00796b' },
  img8: { name: '토끼', body: '#f8bbd0', belly: '#ffffff', ears: 'long', snout: '#ffffff', teeth: true, tail: 'puff' },
}

const burst = (x, y, s = 1) => star(x, y, 9 * s, '#fff59d') + star(x, y, 4.5 * s, '#ffffff')
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
  let s = path('M12,88 Q10,44 48,36 Q86,44 84,88 Z', body)
  s += path('M24,52 Q30,44 40,42', 'none', { stroke: '#ffffff', 'stroke-width': 3, opacity: 0.7 })
  return s
}
const slimeFace = (p) => eyes(p, 54, 70, 60) + mouth(p, 63, 70, 4)

/** 소품 그리기. T = 물들이기(맞음·얼음) */
const ACCESSORIES = {
  plain: () => ({}),
  cape: (p, T, c = '#7b1fa2') => {
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
  const parts = m.acc.map((a) => ACCESSORIES[a](p, T))
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
const ACC_ORDER = ['cape', 'backpack', 'armor', 'sneakers', 'hat', 'crown']
const TRAIT_ACC = { hp: 'backpack', armor: 'armor', agi: 'hat', spd: 'sneakers' }
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
  boss: { name: '우두머리 (왕관 + 망토)', body: '#e53935', traits: [], extra: ['cape', 'crown'] },
}
const MONSTERS = Object.fromEntries(
  Object.entries(GAME_MONSTERS).map(([id, m]) => [
    `mon_${id}`,
    { name: m.name, body: m.body, acc: [...m.traits.map((t) => TRAIT_ACC[t]), ...(m.extra ?? [])].sort((x, y) => ACC_ORDER.indexOf(x) - ACC_ORDER.indexOf(y)) },
  ]),
)

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
  for (const [id, a] of Object.entries(ANIMALS)) {
    list.push({ id, name: a.name, kind: 'unit', motions: UNIT_MOTIONS, draw: (p) => animal(a, p) })
  }
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
