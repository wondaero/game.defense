/**
 * 디자인된 알림 · 확인 창 (2026-11-29): 브라우저 alert/confirm 대신.
 * 어디서든 `await showAlert('…')`, `if (await showConfirm({ … })) …` 로 부름. 창은 main.tsx 의 <DialogHost /> 가 그림
 */
import { useEffect, useState } from 'react'

interface Req {
  title?: string
  message: string
  ok: string
  cancel?: string
  danger?: boolean
  resolve: (v: boolean) => void
}
let push: ((r: Req) => void) | null = null
const queue: Req[] = []

function open(r: Omit<Req, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    const req = { ...r, resolve }
    if (push) push(req)
    else queue.push(req)
  })
}

/** 알림 (확인 버튼 하나) */
export const showAlert = (message: string, title?: string) => open({ message, title, ok: '확인' }).then(() => undefined)

/** 확인 (취소 / 동작). danger 면 동작 버튼이 빨강 */
export const showConfirm = (o: { title?: string; message: string; ok?: string; cancel?: string; danger?: boolean }) =>
  open({ title: o.title, message: o.message, ok: o.ok ?? '확인', cancel: o.cancel ?? '취소', danger: o.danger })

export function DialogHost() {
  const [list, setList] = useState<Req[]>([])
  useEffect(() => {
    push = (r) => setList((l) => [...l, r])
    if (queue.length) setList((l) => [...l, ...queue.splice(0)])
    return () => {
      push = null
    }
  }, [])
  const cur = list[0]
  if (!cur) return null
  const close = (v: boolean) => {
    cur.resolve(v)
    setList((l) => l.slice(1))
  }
  return (
    <div className="modal-backdrop dialog-back" onClick={() => cur.cancel && close(false)}>
      <div className="modal dialog" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        {cur.title && <div className="modal-title">{cur.title}</div>}
        <p className="dialog-msg">{cur.message}</p>
        <div className="row pause-row">
          {cur.cancel && <button onClick={() => close(false)}>{cur.cancel}</button>}
          <button className={cur.danger ? 'danger' : 'primary inline'} autoFocus onClick={() => close(true)}>
            {cur.ok}
          </button>
        </div>
      </div>
    </div>
  )
}
