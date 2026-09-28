import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

export function NewCanvasDialog() {
  const open = useAppStore((s) => s.newCanvasOpen)
  const setOpen = useAppStore((s) => s.setNewCanvasOpen)
  const createCanvas = useAppStore((s) => s.createCanvas)
  const busy = useAppStore((s) => s.busy)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  if (!open) return null

  const field =
    'w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm text-fg transition-colors placeholder:text-faint focus:border-accent-line'

  async function submit(): Promise<void> {
    await createCanvas({
      title: title.trim() || '未命名画布',
      description: description.trim() || undefined
    })
    setTitle('')
    setDescription('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-canvas-title"
        className="flex w-[560px] flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-elevated"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="new-canvas-title" className="text-sm font-medium text-fg">
            新建画布
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭"
            className="rounded px-1 text-lg leading-none text-faint transition-colors hover:text-fg"
          >
            ×
          </button>
        </header>

        <div className="space-y-4 p-5">
          <p className="rounded-md border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-muted">
            一个画布就是一个学习主题。刚建好时它是空的，你提的第一个问题会成为根节点，之后这个主题围绕它长成一棵问答树。
          </p>

          <label className="block space-y-1.5">
            <span className="text-xs text-muted">标题</span>
            <input
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
              placeholder="例如：STM32 标准库 GPIO 代码学习"
              autoFocus
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-muted">描述（可选）</span>
            <textarea
              className={`${field} h-24 resize-none`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：围绕 GPIO_Init() 这段代码，想弄明白时钟使能、推挽输出、电平翻转速度分别是什么。"
            />
            <span className="block text-2xs text-faint">写清这个画布要解决什么，方便以后回看。</span>
          </label>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <span className="text-2xs text-faint">创建后在画布里提第一个问题即可开始。</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              创建
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
