import { useAppStore } from '../store/useAppStore'

interface Props {
  width: number
  collapsed: boolean
  onToggleCollapse: () => void
}

export function Sidebar({ width, collapsed, onToggleCollapse }: Props) {
  const canvases = useAppStore((s) => s.canvases)
  const currentCanvasId = useAppStore((s) => s.currentCanvasId)
  const isGenerating = useAppStore((s) => s.isGenerating())
  const openCanvas = useAppStore((s) => s.openCanvas)
  const setNewCanvasOpen = useAppStore((s) => s.setNewCanvasOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const config = useAppStore((s) => s.config)

  const provider = config?.providers.find(
    (p) => p.id === (config?.defaultProviderId ?? config?.providers[0]?.id)
  )
  const noProviders = (config?.providers.length ?? 0) === 0

  // 收起后只留一条窄边条，点一下再展开
  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-2 border-r border-slate-800 bg-slate-900/60 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="展开画布列表"
          className="rounded px-1 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          »
        </button>
        <span className="text-[11px] tracking-widest text-slate-500 [writing-mode:vertical-rl]">
          画布
        </span>
      </div>
    )
  }

  return (
    <aside
      style={{ width }}
      className="flex shrink-0 flex-col border-r border-slate-800 bg-slate-900/60"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-slate-200">画布</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={isGenerating || noProviders}
            title={noProviders ? '请先在设置中添加 Provider' : undefined}
            onClick={() => setNewCanvasOpen(true)}
            className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + 新建
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="收起画布列表"
            className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            «
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2">
        {canvases.length === 0 && (
          <p className="px-2 py-4 text-xs leading-relaxed text-slate-500">
            {noProviders
              ? '还没有画布。请先在左下角「设置」里添加 Provider 与 API Key。'
              : '还没有画布，点「+ 新建」开始。'}
          </p>
        )}
        {canvases.map((canvas) => (
          <button
            type="button"
            key={canvas.id}
            disabled={isGenerating}
            onClick={() => void openCanvas(canvas.id)}
            title={canvas.description ?? canvas.title}
            className={`block w-full rounded px-3 py-2 text-left text-sm disabled:cursor-not-allowed ${
              canvas.id === currentCanvasId
                ? 'bg-slate-700/70 text-slate-100'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span className="block truncate">{canvas.title}</span>
            {canvas.description && (
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {canvas.description}
              </span>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="m-2 rounded border border-slate-700 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800"
      >
        <div className="font-medium text-slate-200">设置</div>
        <div className="truncate text-slate-500">
          {provider
            ? `${provider.name} · ${provider.defaultModel ?? '未设置模型'}`
            : '点此添加 Provider 与 API Key'}
        </div>
      </button>
    </aside>
  )
}
