import { ABILITY_KINDS, ABILITY_NAMES, MONSTER_ABILITIES, MONSTER_ABILITY_KINDS, monsterAbilityDesc, stageDef, type MonsterSpec } from '@def/defense'
import { AbilityRolls, sampleAbility } from './abilityRolls.tsx'
import { splitDesc, UnitFace } from './UnitList.tsx'

/**
 * 설정 탭의 도감 (2026-11-28): 캐릭 특수능력 전부(뽑을 수 있는 값 전부) · 몬스터 능력 전부.
 * 값은 엔진 표에서 바로 → 수치가 바뀌면 도감도 같이 바뀜
 */
export function Codex() {
  // 몬스터 능력 설명은 탄마다 수치가 조금 다른 것(단단해지기 방어량)이 있어 대표로 50탄 기준
  const spec = Object.values(stageDef(50).monsters)[0] as MonsterSpec
  return (
    <>
      <section>
        <h3>캐릭 특수능력 도감 ({ABILITY_KINDS.length}종)</h3>
        <p className="dim" style={{ margin: '0 0 8px' }}>
          특수능력은 모두 같은 확률로 붙고, 굵은 숫자 중 하나가 뽑혀요
        </p>
        <ul className="codex">
          {ABILITY_KINDS.map((k) => (
            <li key={k}>
              <UnitFace body="unit_t1" tool={`tool_${k}`} />
              <div className="ab codex-ab">
                <b className="ab-name">{ABILITY_NAMES[k]}</b>
                <AbilityRolls ability={sampleAbility(k)} all />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>슬라임 능력 도감 ({MONSTER_ABILITY_KINDS.length}종)</h3>
        <p className="dim" style={{ margin: '0 0 8px' }}>
          캐릭에게 맞을 때마다 확률로 터져요. 10탄부터 붙기 시작
        </p>
        <ul className="codex">
          {MONSTER_ABILITY_KINDS.map((k) => {
            const d = MONSTER_ABILITIES[k]
            const { main, notes } = splitDesc(d.name, monsterAbilityDesc(k, spec))
            return (
              <li key={k}>
                <span className="codex-icon">{d.icon}</span>
                <div className="ab codex-ab">
                  <b className="ab-name">{d.name}</b>
                  <span className="ab-desc">{main}</span>
                  {notes.length > 0 && <span className="ab-note">{notes.join(' · ')}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
