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

// ── 몬스터 4종 (오른쪽 보기) ──
function slime(p, c) {
  const T = tinter(p)
  const b = T(c.body)
  let s = path('M12,88 Q10,44 48,36 Q86,44 84,88 Z', b)
  s += path('M24,52 Q30,44 40,42', 'none', { stroke: '#ffffff', 'stroke-width': 3, opacity: 0.7 })
  s += eyes(p, 54, 70, 60)
  s += mouth(p, 63, 70, 4)
  return s
}
function bee(p, c) {
  const T = tinter(p)
  const flap = p.flap ?? 0
  let s = ''
  s += path('M20,60 L8,58 M22,68 L10,70 M22,52 L12,48', 'none', { stroke: T('#ffffff'), 'stroke-width': 2.5, opacity: 0.8 })
  s += ell(44, 38 - flap * 4, 9, 14, T('#e1f5fe'), { opacity: 0.85, transform: `rotate(${-25 - flap * 30} 46 46)` })
  s += path('M22,62 L14,64 L22,66 Z', T('#424242'))
  s += ell(48, 62, 26, 20, T(c.body))
  s += path('M40,43 Q36,62 40,81 M54,43 Q50,62 54,81', 'none', { stroke: T('#424242'), 'stroke-width': 6 })
  s += ell(52, 38 - flap * 4, 9, 14, T('#e1f5fe'), { opacity: 0.9, transform: `rotate(${20 + flap * 30} 52 46)` })
  s += eyes(p, 62, 72, 58, 0.9)
  s += mouth(p, 68, 68, 3)
  return s
}
function golem(p, c) {
  const T = tinter(p)
  const step = p.step ?? 0
  let s = ''
  s += `<rect x="${26 + step * 3}" y="74" width="14" height="14" rx="4" fill="${T(mix(c.body, '#000000', 0.25))}" stroke="${OUT}" stroke-width="${SW}"/>`
  s += `<rect x="${56 - step * 3}" y="74" width="14" height="14" rx="4" fill="${T(mix(c.body, '#000000', 0.25))}" stroke="${OUT}" stroke-width="${SW}"/>`
  s += `<rect x="14" y="28" width="68" height="52" rx="16" fill="${T(c.body)}" stroke="${OUT}" stroke-width="${SW}"/>`
  s += path('M26,40 L34,48 L30,56 M64,66 L72,58', 'none', { stroke: T(mix(c.body, '#000000', 0.4)), 'stroke-width': 2 })
  s += ell(30, 32, 10, 5, T('#7cb342'), { 'stroke-width': 0 })
  s += eyes({ ...p, eyes: p.eyes ?? 'angry' }, 56, 70, 50)
  s += path('M58,64 L72,64', 'none', { 'stroke-width': 3 })
  return s
}
function demon(p, c) {
  const T = tinter(p)
  let s = ''
  s += path('M26,40 Q14,22 22,8 Q28,26 38,34 Z', T('#fff8e1'))
  s += path('M70,40 Q82,22 74,8 Q68,26 58,34 Z', T('#fff8e1'))
  s += path('M8,88 Q6,36 48,28 Q90,36 88,88 Z', T(c.body))
  s += path('M20,60 Q24,46 36,40', 'none', { stroke: '#ffffff', 'stroke-width': 3, opacity: 0.5 })
  s += eyes({ ...p, eyes: p.eyes ?? 'angry' }, 54, 72, 54, 1.2)
  s += path('M50,70 Q63,80 78,70 Z', T('#4a0000'))
  s += path('M54,71 L57,77 L60,72 M68,72 L71,77 L74,71', '#ffffff', { 'stroke-width': 1.2 })
  return s
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

const MONSTERS = {
  mon_normal: { name: '보통 (슬라임)', body: '#7cb342', draw: slime, walk: () => ({}) },
  mon_fast: { name: '날쌘돌이 (벌)', body: '#fdd835', draw: bee, walk: (i) => ({ flap: i % 2, dy: [-4, -6, -8, -6, -4, -2][i] - 0, sy: 1, sx: 1 }) },
  mon_tank: { name: '단단이 (바위)', body: '#8d6e63', draw: golem, walk: (i) => ({ step: [1, 0.5, 0, -0.5, -1, -0.5][i], sy: 1, sx: 1, dy: i % 3 === 0 ? 0 : -1 }) },
  mon_boss: { name: '우두머리 (뿔 괴물)', body: '#e53935', draw: demon, walk: () => ({}) },
}

/** 모든 개체 목록 */
export function entities() {
  const list = []
  for (const [id, a] of Object.entries(ANIMALS)) {
    list.push({ id, name: a.name, kind: 'unit', motions: UNIT_MOTIONS, draw: (p) => animal(a, p) })
  }
  for (const [id, m] of Object.entries(MONSTERS)) {
    const motions = monsterMotions(m.walk)
    list.push({
      id,
      name: m.name,
      kind: 'monster',
      motions,
      draw: (p) => posed(p, m.draw(p, m)) + (p.fx ?? ''),
    })
  }
  return list
}
