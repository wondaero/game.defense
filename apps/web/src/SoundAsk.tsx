import { useState } from 'react'
import { Icon } from './Icon.tsx'
import { answerSoundAsk, needSoundAsk } from './sound.ts'

/** 처음 들어온 기기에만: "소리를 켤까요?" 작은 창 (2026-11-29). 고르면 저장되어 다시 안 물음 */
export function SoundAsk() {
  const [open, setOpen] = useState(needSoundAsk)
  if (!open) return null
  const pick = (on: boolean) => {
    answerSoundAsk(on)
    setOpen(false)
  }
  return (
    <div className="modal-backdrop dialog-back">
      <div className="modal dialog sound-ask" role="dialog">
        <div className="sa-icon">
          <Icon name="music" size={40} />
        </div>
        <div className="modal-title">소리를 켤까요?</div>
        <p className="dim dialog-msg">배경음과 효과음은 설정에서 언제든 바꿀 수 있어요.</p>
        <div className="row pause-row">
          <button onClick={() => pick(false)}>소리 끄고 하기</button>
          <button className="primary inline" autoFocus onClick={() => pick(true)}>
            소리 켜기
          </button>
        </div>
      </div>
    </div>
  )
}
