import {
  ABILITY_COOLDOWN_MS,
  AGI_COPY_MS,
  FRENZY_MS,
  HYPNOSIS_CELLS,
  ICE_TILE_MS,
  LULLABY_MS,
  LULLABY_WAKE_HITS,
  ROLL_TABLE,
  SPLASH_RADIUS,
  STAT_NAMES,
  TEAM_LEVEL_MS,
  type Ability,
  type BuffStat,
} from '@def/defense'

/**
 * 특수능력 설명을 "뽑을 수 있는 값 전부 + 이 캐릭이 뽑은 값 표시"로 (2026-11-28)
 * 예) 5 / 10 / 15% 확률로 0.5 / 1 / 1.5초 스턴 — 뽑힌 값만 굵게 + 밑줄, 나머지는 옅게
 * 값 후보는 엔진 ROLL_TABLE 그대로 (수치가 바뀌면 같이 바뀜)
 */
type Part = string | { opts: string[]; pick: number; unit?: string }
const pct = (bp: number) => `${bp / 100}`
const sec = (ms: number) => `${ms / 1000}`
const pickOf = <T,>(opts: readonly T[], v: T) => Math.max(0, opts.indexOf(v))
const o = <T,>(opts: readonly T[], v: T, fmt: (x: T) => string, unit?: string): Part => ({ opts: opts.map(fmt), pick: pickOf(opts, v), unit })
const cd = (k: Ability['kind']) => (ABILITY_COOLDOWN_MS[k] ? [`쿨타임 ${sec(ABILITY_COOLDOWN_MS[k])}초`] : [])

function parts(a: Ability): { main: Part[]; notes: Part[][] } {
  const t = ROLL_TABLE
  const chance = (opts: readonly number[]) => o(opts, a.chanceBp, pct, '%')
  switch (a.kind) {
    case 'stun':
      return { main: [chance(t.stun.chanceBp), ' 확률로 ', o(t.stun.durationMs, a.durationMs, sec, '초'), ' 스턴'], notes: cd(a.kind).map((x) => [x]) }
    case 'splash':
      return { main: [chance(t.splash.chanceBp), ` 확률로 맞힌 자리 중심 ${SPLASH_RADIUS * 2 + 1}×${SPLASH_RADIUS * 2 + 1} 광역공격`], notes: [] }
    case 'crit':
      return { main: [chance(t.crit.chanceBp), ' 확률로 2배 데미지'], notes: [['피해 = 공격력×2 − 방어력']] }
    case 'obstacle': {
      const kindNames = { damage: '가시', slow: '늪' } as const
      const amount = a.obstacle === 'damage' ? o(t.obstacle.damageBp, a.amountBp, pct, '%') : o(t.obstacle.slowBp, a.amountBp, pct, '%')
      return {
        main: [chance(t.obstacle.chanceBp), ' 확률로 길 무작위 칸에 ', o(t.obstacle.obstacle, a.obstacle, (k) => kindNames[k]), ' 장애물'],
        notes: [a.obstacle === 'damage' ? ['슬라임이 처음 밟을 때 최대 체력의 ', amount] : ['밟으면 속도 −', amount], ['판당 1회']],
      }
    }
    case 'recall':
      return { main: [chance(t.recall.chanceBp), ' 확률로 때린 슬라임을 출발지로'], notes: cd(a.kind).map((x) => [x]) }
    case 'teamLevel':
      return {
        main: [chance(t.teamLevel.chanceBp), ' 확률로 아군 전체 ', o(t.teamLevel.stat, a.stat, (s: BuffStat) => STAT_NAMES[s]), ' 레벨 +', o(t.teamLevel.level, a.level, String)],
        notes: [[`${sec(TEAM_LEVEL_MS)}초 동안`], ...cd(a.kind).map((x) => [x])],
      }
    case 'allAttack':
      return { main: [chance(t.allAttack.chanceBp), ' 확률로 맵에 있는 슬라임 전체 공격'], notes: [['피해 = 공격력 − 방어력'], ...cd(a.kind).map((x) => [x])] }
    case 'poison':
      return { main: [chance(t.poison.chanceBp), ' 확률로 죽을 때까지 1초마다 공격력의 ', o(t.poison.pctBp, a.pctBp, pct, '%')], notes: [['방어 무시'], ['슬라임당 한 번']] }
    case 'boostAll':
      return { main: ['공격력·공속·민첩 모두 × ', o(t.boost.mulBp, a.mulBp, (m) => `${m / 10000}`)], notes: [['항상'], ['최대를 넘을 수 있음'], ['사거리 제외'], ['봉인되면 원래 값']] }
    case 'frenzy':
      return { main: [chance(t.frenzy.chanceBp), ` 확률로 ${sec(FRENZY_MS)}초 동안 공속 2배 · 민첩 2배`], notes: [['쿨타임 ', o(t.frenzy.cooldownMs, a.cooldownMs, sec, '초')]] }
    case 'hawkeye':
      return { main: ['사거리 +', o(t.hawkeye.plus, a.plus, String)], notes: [['항상'], ['봉인되면 원래 사거리']] }
    case 'hypnosis':
      return { main: [chance(t.hypnosis.chanceBp), ` 확률로 때린 슬라임이 ${HYPNOSIS_CELLS}칸 뒤로 갔다가 다시 옴`], notes: [['슬라임당 한 번']] }
    case 'instakill':
      return { main: [chance(t.instakill.chanceBp), ' 확률로 때린 슬라임 즉사'], notes: [['왕에겐 안 통함']] }
    case 'iceTile':
      return { main: [chance(t.iceTile.chanceBp), ` 확률로 때린 슬라임이 있는 칸의 슬라임 모두 ${sec(ICE_TILE_MS)}초 얼림`], notes: cd(a.kind).map((x) => [x]) }
    case 'lullaby':
      return { main: [chance(t.lullaby.chanceBp), ` 확률로 슬라임 모두 ${sec(LULLABY_MS)}초 잠듦`], notes: [[`${LULLABY_WAKE_HITS}대 맞으면 깸`], ...cd(a.kind).map((x) => [x])] }
    case 'agiCopy':
      return { main: [chance(t.agiCopy.chanceBp), ` 확률로 때린 슬라임의 민첩을 ${sec(AGI_COPY_MS)}초 동안 내 민첩에 더함`], notes: cd(a.kind).map((x) => [x]) }
    case 'pierce':
      return { main: [chance(t.pierce.chanceBp), ' 확률로 관통: 가로·세로로 쏘면 곧게 이어진 길의 슬라임 모두 피해'], notes: [['대각선이면 그 칸의 슬라임만'], ['피해 = 공격력 − 방어력'], ['슬라임마다 명중 판정'], ['길이 끊기면 멈춤']] }
  }
}

function Render({ ps, all }: { ps: Part[]; all?: boolean }) {
  return (
    <>
      {ps.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : p.opts.length === 1 ? (
          <span key={i}>
            {p.opts[0]}
            {p.unit}
          </span>
        ) : (
          <span key={i} className="roll">
            {p.opts.map((x, j) => (
              <span key={j}>
                {j > 0 && <span className="roll-sep"> / </span>}
                <span className={all ? 'roll-any' : j === p.pick ? 'roll-pick' : 'roll-other'}>{x}</span>
              </span>
            ))}
            {p.unit}
          </span>
        ),
      )}
    </>
  )
}

/** 캐릭 자세히 창용 특수능력 설명 (뽑을 수 있는 값 전부, 뽑힌 값 강조) */
export function AbilityRolls({ ability, all }: { ability: Ability; /** 도감: 강조 없이 후보만 */ all?: boolean }) {
  const { main, notes } = parts(ability)
  return (
    <>
      <span className="ab-desc rolls">
        <Render ps={main} all={all} />
      </span>
      {notes.length > 0 && (
        <span className="ab-note">
          {notes.map((n, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <Render ps={n} all={all} />
            </span>
          ))}
        </span>
      )}
    </>
  )
}

/** 도감용: 종류마다 대표 능력 하나 (값은 후보 전부 보여 주므로 아무거나) */
export function sampleAbility(kind: Ability['kind']): Ability {
  const t = ROLL_TABLE
  switch (kind) {
    case 'stun':
      return { kind, chanceBp: t.stun.chanceBp[0], durationMs: t.stun.durationMs[0] }
    case 'obstacle':
      return { kind, chanceBp: t.obstacle.chanceBp[0], obstacle: 'damage', amountBp: t.obstacle.damageBp[0] }
    case 'teamLevel':
      return { kind, chanceBp: t.teamLevel.chanceBp[0], stat: t.teamLevel.stat[0]!, level: t.teamLevel.level[0] }
    case 'poison':
      return { kind, chanceBp: t.poison.chanceBp[0], pctBp: t.poison.pctBp[0] }
    case 'boostAll':
      return { kind, chanceBp: 0, mulBp: t.boost.mulBp[0] }
    case 'frenzy':
      return { kind, chanceBp: t.frenzy.chanceBp[0], cooldownMs: t.frenzy.cooldownMs[0] }
    case 'hawkeye':
      return { kind, chanceBp: 0, plus: t.hawkeye.plus[0] }
    default:
      return { kind, chanceBp: (t[kind] as { chanceBp: readonly number[] }).chanceBp[0]! } as Ability
  }
}
