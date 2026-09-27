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
    'w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-indigo-500'

  async function submit(): Promise<void> {
    await createCanvas({
      title: title.trim() || '未命名画布',
      description: description.trim() || undefined
    })
    setTitle('')
    setDescription('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex w-[560px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-100">新建画布</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-200">
            ×
          </button>
        </header>

        <div className="space-y-4 p-5">
          <p className="rounded-lg bg-slate-800/50 px-3 py-2 text-xs leading-relaxed text-slate-400">
            一个画布就是一个学习主题。刚建好时它是空的，你提的第一个问题会成为根节点，之后这个主题围绕它长成一棵问答树。
          </p>

          <label className="block space-y-1">
            <span className="text-xs text-slate-400">标题</span>
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

          <label className="block space-y-1">
            <span className="text-xs text-slate-400">描述（可选）</span>
            <textarea
              className={`${field} h-24 resize-none`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：围绕 GPIO_Init() 这段代码，想弄明白时钟使能、推挽输出、电平翻转速度分别是什么。"
            />
            <span className="text-[11px] text-slate-500">写清这个画布要解决什么，方便以后回看。</span>
          </label>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-800 px-5 py-3">
          <span className="text-[11px] text-slate-500">创建后在画布里提第一个问题即可开始。</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              创建
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
