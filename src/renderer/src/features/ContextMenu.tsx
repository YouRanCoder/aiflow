import { useEffect, useState } from 'react'

export interface MenuItem {
  label: string
  danger?: boolean
  disabled?: boolean
  onSelect?: () => void
  /** 选中后原地变成输入框，回车提交 */
  input?: { placeholder: string; initial?: string; onSubmit: (value: string) => void }
  /** 危险操作：第一次点击变成这个文案，再点一次才执行 */
  confirmLabel?: string
  onConfirm?: () => void
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

interface Props {
  state: MenuState | null
  onClose: () => void
}

export function ContextMenu({ state, onClose }: Props) {
  const [inputFor, setInputFor] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [confirmFor, setConfirmFor] = useState<string | null>(null)

  useEffect(() => {
    setInputFor(null)
    setValue('')
    setConfirmFor(null)
  }, [state])

  useEffect(() => {
    if (!state) return
    function close(): void {
      onClose()
    }
    window.addEventListener('click', close)
    window.addEventListener('resize', close)
    window.addEventListener('wheel', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('wheel', close)
    }
  }, [state, onClose])

  if (!state) return null

  return (
    <div
      className="fixed z-[60] min-w-[180px] rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-2xl"
      style={{ left: state.x, top: state.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {state.items.map((item) => {
        if (item.input && inputFor === item.label) {
          return (
            <form
              key={item.label}
              className="flex gap-1 px-2 py-1"
              onSubmit={(event) => {
                event.preventDefault()
                const trimmed = value.trim()
                onClose()
                if (trimmed) item.input?.onSubmit(trimmed)
              }}
            >
              <input
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={item.input.placeholder}
                className="w-44 rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') onClose()
                }}
              />
              <button type="submit" className="shrink-0 rounded bg-indigo-600 px-2 text-xs text-white">
                确定
              </button>
            </form>
          )
        }

        const isConfirming = confirmFor === item.label

        return (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.input) {
                setValue(item.input.initial ?? '')
                setInputFor(item.label)
                return
              }
              if (item.confirmLabel && !isConfirming) {
                setConfirmFor(item.label)
                return
              }
              onClose()
              if (isConfirming) item.onConfirm?.()
              else item.onSelect?.()
            }}
            className={`block w-full px-3 py-1.5 text-left text-xs disabled:opacity-40 ${
              item.danger || isConfirming
                ? 'text-rose-200 hover:bg-rose-900/40'
                : 'text-slate-200 hover:bg-slate-800'
            }`}
          >
            {isConfirming ? item.confirmLabel : item.label}
          </button>
        )
      })}
    </div>
  )
}
