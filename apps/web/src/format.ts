import { ABILITY_NAMES, abilityDesc, type UnitInstance } from '@def/defense'

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
