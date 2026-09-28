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
      <div className="flex w-9 shrink-0 flex-col items-center gap-2 border-r border-line bg-panel py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="展开画布列表"
          aria-label="展开画布列表"
          className="rounded px-1 py-0.5 text-muted transition-colors hover:bg-raised hover:text-fg"
        >
          »
        </button>
        <span className="text-2xs tracking-widest text-faint [writing-mode:vertical-rl]">画布</span>
      </div>
    )
  }

  return (
    <aside style={{ width }} className="flex shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-medium text-fg">画布</span>
          {canvases.length > 0 && <span className="tnum text-2xs text-faint">{canvases.length}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={isGenerating || noProviders}
            title={noProviders ? '请先在设置中添加 Provider' : '新建画布'}
            onClick={() => setNewCanvasOpen(true)}
            className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            + 新建
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="收起画布列表"
            aria-label="收起画布列表"
            className="rounded px-1.5 py-1 text-muted transition-colors hover:bg-raised hover:text-fg"
          >
            «
          </button>
        </div>
      </div>

      <div className="scroll-stable flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {canvases.length === 0 && (
          <p className="px-2 py-3 text-xs leading-relaxed text-faint">
            {noProviders
              ? '还没有画布。请先在左下角「设置」里添加 Provider 与 API Key。'
              : '还没有画布，点「+ 新建」开始。'}
          </p>
        )}
        {canvases.map((canvas) => {
          const active = canvas.id === currentCanvasId
          return (
            <button
              type="button"
              key={canvas.id}
              disabled={isGenerating}
              aria-current={active ? 'true' : undefined}
              onClick={() => void openCanvas(canvas.id)}
              title={canvas.description ?? canvas.title}
              className={`block w-full rounded-md px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed ${
                active
                  ? 'bg-accent-soft text-fg'
                  : 'text-muted hover:bg-raised hover:text-fg'
              }`}
            >
              <span className="block truncate text-sm">{canvas.title}</span>
              {canvas.description && (
                <span className="mt-0.5 block truncate text-xs text-faint">{canvas.description}</span>
              )}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="m-2 rounded-md border border-line px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-raised"
      >
        <div className="text-xs font-medium text-fg">设置</div>
        <div className="mt-0.5 truncate text-xs text-faint">
          {provider
            ? `${provider.name} · ${provider.defaultModel ?? '未设置模型'}`
            : '点此添加 Provider 与 API Key'}
        </div>
      </button>
    </aside>
  )
}
