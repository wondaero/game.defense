/**
 * 소리 (2026-11-28): 파일 없이 브라우저(Web Audio)에서 그 자리에서 합성.
 * - 배경음: 마을 곡(메뉴·배치, F장조 96BPM) · 게임 곡(밝은 칩튠, 120BPM) · 우두머리 곡(A단조, 150BPM, 우두머리가 판에 있는 동안)
 * - 효과음: 맞음(hit) · 치명타(crit) · 처치(kill) · 특수능력(proc) · 통과(leak) · 클리어(clear) · 실패(fail)
 * - 같은 소리가 한꺼번에 몰리면 시끄러우니 종류마다 최소 간격(throttle)
 * - 휴대폰은 사용자가 화면을 한 번 눌러야 소리가 나므로 첫 터치 때 켬 (unlockAudio)
 * 화면에서 소리를 내고 싶으면 sfx.xxx() / bgm.start() 만 부르면 됨
 */

const PREF_KEY = 'defense.sound.v1'
export interface SoundPrefs {
  bgm: boolean
  sfx: boolean
  /** 크기 0~100. 기본은 배경음이 효과음보다 작게 (배경음 40 · 효과음 80) */
  bgmVol: number
  sfxVol: number
  /** 결정적 순간 다시 보기(확대·슬로우) — 소리는 아니지만 기기 설정이라 같이 저장 (2026-11-29) */
  replay: boolean
}
export const DEFAULT_SOUND: SoundPrefs = { bgm: true, sfx: true, bgmVol: 40, sfxVol: 80, replay: true }
/** 처음 들어온 기기 = 소리 설정 저장값이 없음 (2026-11-29) → 소리 꺼 두고 "소리 켤까요?" 창 */
let firstVisit = false
function loadPrefs(): SoundPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw == null) {
      firstVisit = true
      return { ...DEFAULT_SOUND, bgm: false, sfx: false }
    }
    return { ...DEFAULT_SOUND, ...(JSON.parse(raw) as Partial<SoundPrefs>) }
  } catch {
    return { ...DEFAULT_SOUND }
  }
}
/** 첫 방문이라 소리를 물어봐야 하는지 */
export const needSoundAsk = () => firstVisit
/** 첫 방문 질문에 답함: 켜기면 배경음·효과음 켜고 바로 시작 (이 버튼 누름이 브라우저의 첫 터치) */
export function answerSoundAsk(on: boolean) {
  firstVisit = false
  setSoundPrefs({ bgm: on, sfx: on })
  if (on) unlockAudio()
}
/** 크기(0~100) → 실제 소리 세기. 100 일 때 배경음 0.8 · 효과음 0.875 (40 · 80 이 예전 기본 세기와 같음) */
const BGM_MAX = 0.8
const SFX_MAX = 0.875
function applyVolumes() {
  if (!ctx) return
  const t = ctx.currentTime
  // 끊기는 소리 없이 부드럽게 바뀌게
  bgmBus.gain.setTargetAtTime((prefs.bgmVol / 100) * BGM_MAX, t, 0.03)
  sfxBus.gain.setTargetAtTime((prefs.sfxVol / 100) * SFX_MAX, t, 0.03)
}
let prefs = loadPrefs()
export const getSoundPrefs = () => prefs
export function setSoundPrefs(p: Partial<SoundPrefs>) {
  prefs = { ...prefs, ...p }
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
  applyVolumes()
  if (!prefs.bgm) bgm.stop()
  else if (ctx) bgm.start()
}

// ── 오디오 기본 ──
let ctx: AudioContext | null = null
let master: GainNode
let bgmBus: GainNode
let sfxBus: GainNode
let noiseBuf: AudioBuffer

/** 첫 사용자 터치 때 부름 (그 전엔 브라우저가 소리를 막음) */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.9
    // 너무 큰 소리가 겹쳐도 찢어지지 않게 살짝 눌러 줌
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    master.connect(comp).connect(ctx.destination)
    bgmBus = ctx.createGain()
    bgmBus.gain.value = (prefs.bgmVol / 100) * BGM_MAX
    bgmBus.connect(master)
    sfxBus = ctx.createGain()
    sfxBus.gain.value = (prefs.sfxVol / 100) * SFX_MAX
    sfxBus.connect(master)
    // 북·타격음에 쓰는 하얀 잡음 1초
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
  if (prefs.bgm) bgm.start()
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

/** 음 하나: 파형 · 높이(Hz) · 시작 · 길이 · 크기, 끝 높이를 주면 미끄러짐 */
function tone(bus: GainNode, type: OscillatorType, hz: number, t: number, dur: number, vol: number, endHz?: number, attack = 0.004) {
  const c = ctx!
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(hz, t)
  if (endHz) o.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(bus)
  o.start(t)
  o.stop(t + dur + 0.02)
}

/** 잡음 한 번 (filter = 거르는 종류·주파수) */
function noise(bus: GainNode, t: number, dur: number, vol: number, filter: BiquadFilterType, freq: number) {
  const c = ctx!
  const s = c.createBufferSource()
  s.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = filter
  f.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(bus)
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur + 0.02)
}

// ── 배경음 ──
// 곡 = 마디마다 화음 뿌리음 · 화음 · 멜로디(한 마디 8칸 = 8분음표, null = 쉼). 8마디 반복
interface Track {
  bpm: number
  roots: number[]
  chords: number[][]
  melody: (number | null)[][]
  /** 칸마다 소리 내는 법 (베이스·아르페지오·북은 곡마다 느낌이 달라서) */
  play: (tr: Track, bar: number, pos: number, t: number, step: number) => void
}
const MAJ = [0, 4, 7]
const MIN = [0, 3, 7]

/** 평화로운 기본 곡: C → G → Am → F | C → G → F → G, 120BPM, 밝은 칩튠 */
const PEACE: Track = {
  bpm: 120,
  roots: [48, 43, 45, 41, 48, 43, 41, 43],
  chords: [MAJ, MAJ, MIN, MAJ, MAJ, MAJ, MAJ, MAJ],
  melody: [
    [72, null, 76, 79, 76, null, 74, 72],
    [74, null, 71, 74, 79, null, 77, 76],
    [76, null, 72, 76, 81, 79, 76, null],
    [77, 76, 74, null, 72, null, 69, null],
    [72, null, 76, 79, 84, null, 83, 81],
    [79, null, 74, 79, 83, 81, 79, null],
    [77, 79, 81, 77, 76, 74, 72, null],
    [74, null, 79, null, 74, 76, 77, 79],
  ],
  play(tr, bar, pos, t, step) {
    const root = tr.roots[bar]!
    const chord = tr.chords[bar]!
    // 베이스: 1·3·5·7칸, 뿌리음 ↔ 5도
    if (pos % 2 === 0) tone(bgmBus, 'triangle', midiHz(root - 12 + (pos === 4 ? 7 : 0)), t, step * 1.6, 0.55)
    // 아르페지오: 매 칸 화음을 위아래로, 작게
    tone(bgmBus, 'square', midiHz(root + 12 + chord[[0, 1, 2, 1][pos % 4]!]!), t, step * 0.7, 0.07)
    const m = tr.melody[bar]![pos]
    if (m != null) tone(bgmBus, 'square', midiHz(m), t, step * 0.95, 0.16, undefined, 0.006)
    // 북: 1·5칸 쿵, 3·7칸 짝, 매 칸 칙
    if (pos === 0 || pos === 4) tone(bgmBus, 'sine', 140, t, 0.16, 0.8, 42)
    if (pos === 2 || pos === 6) noise(bgmBus, t, 0.12, 0.35, 'bandpass', 1800)
    noise(bgmBus, t, 0.03, 0.12, 'highpass', 7000)
  },
}

/** 우두머리 곡 (2026-11-28): A단조 Am → F → G → E, 150BPM. 쉬지 않고 달리는 베이스 + 낮고 무거운 멜로디 + 매 박 쿵 */
const BOSS: Track = {
  bpm: 150,
  roots: [45, 41, 43, 40, 45, 41, 38, 40],
  chords: [MIN, MAJ, MAJ, MAJ, MIN, MAJ, MIN, MAJ],
  melody: [
    [69, null, 72, null, 71, 69, 68, null],
    [69, null, 65, null, 64, null, 65, 67],
    [67, null, 71, null, 74, 72, 71, null],
    [68, null, 71, null, 76, null, 75, 76],
    [81, null, 79, 77, 76, null, 77, 79],
    [77, null, 76, 74, 72, null, 74, 76],
    [74, 72, 71, null, 69, null, 71, 72],
    [71, null, 68, null, 64, 68, 71, 74],
  ],
  play(tr, bar, pos, t, step) {
    const root = tr.roots[bar]!
    const chord = tr.chords[bar]!
    // 베이스: 매 칸 뿌리음 옥타브 오르내림 (긴장감) — 톱니파
    tone(bgmBus, 'sawtooth', midiHz(root - 12 + (pos % 2 ? 12 : 0)), t, step * 0.8, 0.22)
    // 낮은 화음 깔기 (마디 처음에 길게)
    if (pos === 0) for (const c of chord) tone(bgmBus, 'triangle', midiHz(root + c), t, step * 7.5, 0.12, undefined, 0.05)
    const m = tr.melody[bar]![pos]
    if (m != null) {
      // 멜로디 두 겹(살짝 어긋나게) → 두껍고 날카롭게
      tone(bgmBus, 'square', midiHz(m), t, step * 0.9, 0.12, undefined, 0.006)
      tone(bgmBus, 'sawtooth', midiHz(m) * 1.006, t, step * 0.9, 0.06, undefined, 0.006)
    }
    // 북: 매 박 쿵(더 낮게), 2·4박 짝(크게), 매 칸 칙
    if (pos % 2 === 0) tone(bgmBus, 'sine', 120, t, 0.18, 0.95, 36)
    if (pos === 2 || pos === 6) noise(bgmBus, t, 0.16, 0.5, 'bandpass', 1500)
    noise(bgmBus, t, 0.03, pos % 2 ? 0.16 : 0.1, 'highpass', 7500)
  },
}
/**
 * 마을 곡 (2026-11-28, 막사·지도·상점·설정·배치): F장조 F → Dm → B♭ → C | F → Am → B♭ → C, 96BPM.
 * 부드러운 삼각파 멜로디 + 느린 베이스 + 잔잔한 분산화음, 북은 아주 작게 — 오래 들어도 덜 피곤하게
 */
const TOWN: Track = {
  bpm: 96,
  roots: [41, 38, 46, 36, 41, 45, 46, 36],
  chords: [MAJ, MIN, MAJ, MAJ, MAJ, MIN, MAJ, MAJ],
  melody: [
    [72, null, 69, null, 72, 74, 72, null],
    [69, null, 65, null, 67, 69, 65, null],
    [70, null, 74, null, 72, 70, 69, null],
    [67, null, null, 69, 70, null, 67, null],
    [72, null, 77, null, 76, 74, 72, null],
    [76, null, 72, null, 69, 72, 76, null],
    [74, null, 70, 74, 77, null, 76, 74],
    [72, null, null, null, 67, null, 69, 70],
  ],
  play(tr, bar, pos, t, step) {
    const root = tr.roots[bar]!
    const chord = tr.chords[bar]!
    // 베이스: 1·5칸만, 길고 둥글게
    if (pos === 0 || pos === 4) tone(bgmBus, 'sine', midiHz(root - 12 + (pos === 4 ? 7 : 0)), t, step * 3.6, 0.5, undefined, 0.02)
    // 분산화음: 사인파로 아주 작게, 올라갔다 내려옴
    tone(bgmBus, 'sine', midiHz(root + 24 + chord[[0, 1, 2, 1][pos % 4]!]!), t, step * 1.4, 0.06, undefined, 0.01)
    const m = tr.melody[bar]![pos]
    if (m != null) tone(bgmBus, 'triangle', midiHz(m), t, step * 1.7, 0.2, undefined, 0.015)
    // 북: 1칸 아주 작은 쿵, 5칸 솔솔 (스네어 없음)
    if (pos === 0) tone(bgmBus, 'sine', 110, t, 0.18, 0.4, 45)
    if (pos === 4) noise(bgmBus, t, 0.08, 0.08, 'bandpass', 5000)
  },
}
const TRACKS = { town: TOWN, peace: PEACE, boss: BOSS }
export type TrackName = keyof typeof TRACKS

let bgmTimer: number | null = null
let nextTime = 0
let step = 0
let track: TrackName = 'town'
/** 다음 박에서 바꿀 곡 (바로 끊지 않고 박자에 맞춰 넘어감) */
let pendingTrack: TrackName | null = null

export const bgm = {
  start() {
    if (!ctx || bgmTimer != null || !prefs.bgm) return
    nextTime = ctx.currentTime + 0.08
    // 0.1초 앞까지 미리 예약해 두는 방식 (타이머가 조금 늦어도 박자가 안 흔들림)
    bgmTimer = window.setInterval(() => {
      while (nextTime < ctx!.currentTime + 0.12) {
        // 곡 바꾸기는 박(짝수 칸)에서, 새 곡은 처음부터
        if (pendingTrack && step % 2 === 0) {
          track = pendingTrack
          pendingTrack = null
          step = 0
        }
        const tr = TRACKS[track]
        const stepSec = 60 / tr.bpm / 2
        tr.play(tr, Math.floor(step / 8) % 8, step % 8, nextTime, stepSec)
        nextTime += stepSec
        step = (step + 1) % 64
      }
    }, 25)
  },
  stop() {
    if (bgmTimer != null) window.clearInterval(bgmTimer)
    bgmTimer = null
  },
  /** 배경음을 ms 동안 잠깐 껐다가 다시 (자장가 등). 꺼짐·켜짐 모두 부드럽게 */
  duck(ms: number) {
    if (!ctx) return
    const g = bgmBus.gain
    const t = ctx.currentTime
    g.cancelScheduledValues(t)
    g.setTargetAtTime(0, t, 0.06)
    g.setTargetAtTime((prefs.bgmVol / 100) * BGM_MAX, t + ms / 1000, 0.35)
  },
  /** 곡 바꾸기: 'town' (메뉴·배치) · 'peace' (게임 진행) · 'boss' (우두머리 등장). 같은 곡이면 아무 일 없음 */
  setTrack(name: TrackName) {
    if ((pendingTrack ?? track) === name) return
    if (bgmTimer == null) {
      // 꺼져 있으면 다음에 켤 때 그 곡으로
      track = name
      step = 0
      pendingTrack = null
    } else pendingTrack = name
  },
  get track() {
    return pendingTrack ?? track
  },
  get playing() {
    return bgmTimer != null
  },
}

// ── 효과음 ──
const lastAt: Record<string, number> = {}
/** 같은 종류는 gapMs 안에 한 번만 (배속·광역에서 수십 번 겹치는 것 방지) */
function gate(kind: string, gapMs: number): number | null {
  if (!ctx || !prefs.sfx) return null
  const now = ctx.currentTime
  if (now - (lastAt[kind] ?? -1) < gapMs / 1000) return null
  lastAt[kind] = now
  return now + 0.005
}
const jitter = (hz: number) => hz * (1 + (Math.random() - 0.5) * 0.12)

export const sfx = {
  /** 맞음: 짧고 둥근 "퍽" (높이를 조금씩 흔들어 반복돼도 덜 거슬리게) */
  hit() {
    const t = gate('hit', 70)
    if (t == null) return
    tone(sfxBus, 'sine', jitter(420), t, 0.08, 0.35, 150)
    noise(sfxBus, t, 0.035, 0.12, 'bandpass', 2500)
  },
  /** 치명타: 더 밝고 큰 "팍" */
  crit() {
    const t = gate('crit', 60)
    if (t == null) return
    tone(sfxBus, 'square', jitter(900), t, 0.1, 0.22, 260)
    noise(sfxBus, t, 0.06, 0.25, 'highpass', 3000)
  },
  /** 처치: 위로 튀는 "뾱" */
  kill() {
    const t = gate('kill', 50)
    if (t == null) return
    tone(sfxBus, 'sine', jitter(320), t, 0.13, 0.4, 1100)
    tone(sfxBus, 'triangle', jitter(640), t + 0.04, 0.1, 0.18, 1600)
  },
  /** 특수능력 발동: 반짝 올라가는 4음 */
  proc() {
    const t = gate('proc', 120)
    if (t == null) return
    ;[84, 88, 91, 96].forEach((m, i) => tone(sfxBus, 'triangle', midiHz(m), t + i * 0.035, 0.12, 0.2))
  },
  /** 통과(별 하나 잃음): 낮은 "삐-뽀" */
  leak() {
    const t = gate('leak', 300)
    if (t == null) return
    tone(sfxBus, 'square', midiHz(57), t, 0.16, 0.2)
    tone(sfxBus, 'square', midiHz(52), t + 0.17, 0.24, 0.2)
  },
  /** 우두머리 등장: 낮게 깔리는 불협 화음 + 우르릉 */
  bossAppear() {
    const t = gate('boss', 1000)
    if (t == null) return
    for (const m of [33, 39, 45]) tone(sfxBus, 'sawtooth', midiHz(m), t, 1.1, 0.22, midiHz(m - 1), 0.03)
    noise(sfxBus, t, 1.0, 0.35, 'lowpass', 300)
    tone(sfxBus, 'square', midiHz(57), t + 0.15, 0.25, 0.14)
    tone(sfxBus, 'square', midiHz(56), t + 0.42, 0.45, 0.14)
  },
  /** 우두머리 처치: 크게 터지고 밝게 올라감 */
  bossDown() {
    const t = gate('boss', 600)
    if (t == null) return
    noise(sfxBus, t, 0.5, 0.45, 'lowpass', 1200)
    tone(sfxBus, 'sine', 160, t, 0.4, 0.6, 40)
    ;[72, 76, 79, 84, 88].forEach((m, i) => tone(sfxBus, 'triangle', midiHz(m), t + 0.12 + i * 0.06, 0.25, 0.2))
  },
  /** 자장가: 오르골 소리로 느린 자장가 한 소절 (원곡 아님, 직접 만든 멜로디) */
  lullaby() {
    const t = gate('lullaby', 1500)
    if (t == null) return
    const mel: [number, number][] = [
      [79, 0.32], [76, 0.32], [79, 0.32], [76, 0.32], [72, 0.48], [74, 0.24], [76, 0.32], [77, 0.32], [76, 0.64],
    ]
    let at = t
    for (const [m, d] of mel) {
      // 오르골 = 맑은 사인 + 한 옥타브 위 살짝, 길게 울림
      tone(sfxBus, 'sine', midiHz(m), at, d * 2.2, 0.3, undefined, 0.005)
      tone(sfxBus, 'sine', midiHz(m + 12), at, d * 1.4, 0.08, undefined, 0.005)
      at += d
    }
    // 밑에 깔리는 화음 (C → F → C)
    for (const [m, s0, d] of [[60, 0, 1.3], [65, 1.3, 0.7], [60, 2.0, 0.9]] as const) tone(sfxBus, 'triangle', midiHz(m - 12), t + s0, d, 0.12, undefined, 0.08)
  },
  /** 클리어: 팡파르 */
  clear() {
    const t = gate('end', 500)
    if (t == null) return
    ;[72, 76, 79, 84].forEach((m, i) => tone(sfxBus, 'square', midiHz(m), t + i * 0.1, 0.16, 0.2))
    ;[72, 76, 79, 84].forEach((m) => tone(sfxBus, 'triangle', midiHz(m), t + 0.42, 0.7, 0.16, undefined, 0.02))
  },
  /** 실패: 내려가는 3음 */
  fail() {
    const t = gate('end', 500)
    if (t == null) return
    ;[67, 63, 60].forEach((m, i) => tone(sfxBus, 'triangle', midiHz(m), t + i * 0.22, 0.3, 0.3))
    tone(sfxBus, 'sine', midiHz(48), t + 0.66, 0.6, 0.3, midiHz(43))
  },
}

// 개발 중 이 파일을 고쳐 저장하면(HMR) 새 모듈이 또 곡을 틀어서 옛 곡과 두 곡이 겹침 → 옛 모듈의 곡·소리 장치를 끔 (2026-11-28)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    bgm.stop()
    void ctx?.close()
  })
}
