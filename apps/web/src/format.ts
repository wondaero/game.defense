import { ABILITY_NAMES, abilityDesc, LAST_NORMAL_STAGE, STAGES_PER_MAP, statTier, type DefenseConfig, type UnitInstance } from '@def/defense'

/** 탄 이름 (2026-11-28): 1~100탄은 "N탄", 101탄부터는 "무한 N탄" (101 = 무한 1) */
export const stageName = (n: number) => (n > LAST_NORMAL_STAGE ? `무한 ${n - LAST_NORMAL_STAGE}탄` : `${n}탄`)
/** 지도 동그라미 안 글자: 100까지는 숫자, 그 뒤는 ∞1, ∞2 … */
export const stageShort = (n: number) => (n > LAST_NORMAL_STAGE ? `∞${n - LAST_NORMAL_STAGE}` : `${n}`)

/**
 * 판·지도 스킨 (2026-11-28): 맵 구간(4탄)마다 풀밭 ↔ 얼음 번갈아 — 1~4 풀밭, 5~8 얼음, …
 * 겉모습만 (규칙·체력 보정과 무관). 지도(StageMap)와 판(ground.ts)이 같이 씀
 */
export type StageTheme = 'grass' | 'ice'
export const chapterTheme = (chapter: number): StageTheme => (chapter % 2 ? 'ice' : 'grass')
export const stageTheme = (n: number): StageTheme => chapterTheme(Math.floor((n - 1) / STAGES_PER_MAP))

/** 그림 8종 (성능 무관, 임시 그림 = 예전 프로젝트와 같은 이모지) */
export const IMAGE_INFO: Record<string, { emoji: string; name: string; color: string }> = {
  img1: { emoji: '🐺', name: '늑대', color: '#90a4ae' },
  img2: { emoji: '🦊', name: '여우', color: '#ff8a65' },
  img3: { emoji: '🐻', name: '곰', color: '#a1887f' },
  img4: { emoji: '🦅', name: '매', color: '#ffd54f' },
  img5: { emoji: '🐍', name: '뱀', color: '#81c784' },
  img6: { emoji: '🦁', name: '사자', color: '#ffb74d' },
  img7: { emoji: '🐢', name: '거북', color: '#4db6ac' },
  img8: { emoji: '🐰', name: '토끼', color: '#f48fb1' },
}
export const imageOf = (image: string) => IMAGE_INFO[image] ?? { emoji: '❔', name: image, color: '#888' }

export function abilityText(u: UnitInstance): { name: string; desc: string } | null {
  if (!u.ability) return null
  return { name: ABILITY_NAMES[u.ability.kind], desc: abilityDesc(u.ability) }
}

/**
 * 캐릭 모습 (2026-11-27): 헬멧 쓴 사람. 헬멧 색 = 능력치 점수 등급(statTier), 손 도구 = 특수능력.
 * body / tool = 스프라이트 이름 (scripts/sprites/art.mjs)
 */
export function unitLook(cfg: DefenseConfig, u: UnitInstance) {
  const t = statTier(cfg, u)
  return {
    body: `unit_t${t.tier}`,
    tool: u.ability ? `tool_${u.ability.kind}` : null,
    color: t.color,
    tier: t.tier,
    tierName: t.name,
    score: t.score,
    /**
     * 캐릭 이름 (2026-11-27): 색 + (100 − 점수) + "호" — 번호가 작을수록 좋음. 99점 = 무지개 1호(총사령관 바로 아래), 1점 = 흰색 99호.
     * 100점은 "총사령관", 0점은 "훈련병"
     */
    title: t.score >= 100 ? '총사령관' : t.score <= 0 ? '훈련병' : `${t.name} ${100 - t.score}호`,
    /** 특별한 칭호 캐릭 (목록 배경이 다름) */
    special: t.score >= 100 ? 'commander' : t.score <= 0 ? 'trainee' : null,
  }
}
