import { useEffect, useRef, useState } from 'react'
import type { NodeWithTurns } from '@shared/types/domain'
import { formatTokens } from './lib/format'
import { ContextRing } from './features/ContextRing'
import { GraphCanvas } from './features/GraphCanvas'
import { NodeDetail } from './features/NodeDetail'
import { NewCanvasDialog } from './features/NewCanvasDialog'
import { PanelSplitter } from './features/PanelSplitter'
import { SettingsDialog } from './features/SettingsDialog'
import { Sidebar } from './features/Sidebar'
import { TreeCanvas } from './features/TreeCanvas'
import { useAppStore } from './store/useAppStore'

type SkinId = 'graph' | 'tree' | 'file-tree'

const DEFAULT_LAYOUT = {
  sidebarWidth: 256,
  detailWidth: 460,
  sidebarCollapsed: false,
  detailCollapsed: false
}
type PanelLayout = typeof DEFAULT_LAYOUT
type PanelKey = 'sidebar' | 'detail'

const MIN_PANEL_WIDTH = 200
/** 画布区至少留这么多，拖不动了就别再往中间挤 */
const MIN_CANVAS_WIDTH = 360
const DEFAULT_CONTEXT_WINDOW = 128000

/**
 * 当前分支已占用的上下文：取分支上「实际发送过的输入 token」的最大值。
 * 上下文是沿分支累积的，所以最深的那个请求的 prompt 就是当前上下文大小。
 */
function branchContextTokens(nodes: NodeWithTurns[], nodeId: string | null): number {
  if (!nodeId) return 0
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  let cursor: string | null = nodeId
  let max = 0
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const node = byId.get(cursor)
    if (!node) break
    for (const turn of node.turns) {
      const active = turn.messages.find((message) => message.isActive)
      if (active) max = Math.max(max, active.usagePrompt)
    }
    cursor = node.parentId
  }
  return max
}

const SKINS: Array<{ id: 'graph' | 'tree' | 'file-tree'; label: string; ready: boolean }> = [
  { id: 'graph', label: '图', ready: true },
  { id: 'tree', label: '树', ready: true },
  { id: 'file-tree', label: '文件树', ready: false }
]

const DEFAULT_SKIN: 'graph' | 'tree' | 'file-tree' = 'graph'

const selectClass =
  'rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs text-slate-200 outline-none hover:border-slate-600 focus:border-indigo-500 disabled:opacity-50'

export function App() {
  const init = useAppStore((s) => s.init)
  const error = useAppStore((s) => s.error)
  const clearError = useAppStore((s) => s.clearError)
  const detail = useAppStore((s) => s.detail)
  const config = useAppStore((s) => s.config)
  const keyStatus = useAppStore((s) => s.keyStatus)
  const isGenerating = useAppStore((s) => s.isGenerating())
  const saveConfig = useAppStore((s) => s.saveConfig)
  const setCanvasProvider = useAppStore((s) => s.setCanvasProvider)

  const [modelDraft, setModelDraft] = useState('')
  const [layout, setLayout] = useState<PanelLayout>(DEFAULT_LAYOUT)
  const [dragging, setDragging] = useState<PanelKey | null>(null)
  const dragRef = useRef<{ key: PanelKey; startX: number; startWidth: number } | null>(null)
  const latestWidthRef = useRef(0)
  const layoutAppliedRef = useRef(false)

  const canvas = detail?.canvas ?? null
  const providers = config?.providers ?? []
  const canvasProvider = providers.find((p) => p.id === canvas?.providerId)

  useEffect(() => {
    setModelDraft(canvas?.model ?? '')
  }, [canvas?.model, canvas?.providerId])

  useEffect(() => {
    void init()
  }, [init])

  // 首次拿到配置时套用已保存的面板布局（之后以本地 state 为准，拖动才顺滑）
  const ui = config?.ui
  useEffect(() => {
    if (layoutAppliedRef.current || !ui) return
    layoutAppliedRef.current = true
    setLayout({
      sidebarWidth: ui.sidebarWidth ?? DEFAULT_LAYOUT.sidebarWidth,
      detailWidth: ui.detailWidth ?? DEFAULT_LAYOUT.detailWidth,
      sidebarCollapsed: ui.sidebarCollapsed ?? false,
      detailCollapsed: ui.detailCollapsed ?? false
    })
  }, [ui])

  function persistLayout(patch: Partial<PanelLayout>): void {
    setLayout((current) => ({ ...current, ...patch }))
    if (!config) return
    void saveConfig({ ui: { ...config.ui, ...patch } })
  }

  function setPanelWidth(key: PanelKey, width: number): void {
    setLayout((current) =>
      key === 'sidebar' ? { ...current, sidebarWidth: width } : { ...current, detailWidth: width }
    )
  }

  function beginResize(key: PanelKey) {
    return (event: React.MouseEvent): void => {
      event.preventDefault()
      const startWidth = key === 'sidebar' ? layout.sidebarWidth : layout.detailWidth
      dragRef.current = { key, startX: event.clientX, startWidth }
      latestWidthRef.current = startWidth
      setDragging(key)
    }
  }

  // 拖动期间只改本地宽度，松手才落盘（避免每移动一像素就写一次配置）
  useEffect(() => {
    if (!dragging) return
    const key = dragging

    function onMove(event: MouseEvent): void {
      const info = dragRef.current
      if (!info) return
      const delta = key === 'sidebar' ? event.clientX - info.startX : info.startX - event.clientX
      const max = Math.max(MIN_PANEL_WIDTH, window.innerWidth - MIN_CANVAS_WIDTH)
      const width = Math.round(Math.min(Math.max(info.startWidth + delta, MIN_PANEL_WIDTH), max))
      latestWidthRef.current = width
      setPanelWidth(key, width)
    }

    function onUp(): void {
      dragRef.current = null
      setDragging(null)
      if (key === 'sidebar') persistLayout({ sidebarWidth: latestWidthRef.current })
      else persistLayout({ detailWidth: latestWidthRef.current })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    // persistLayout / setPanelWidth 每次渲染都是新函数，但拖动期间只需要这一套监听
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  function toggleSidebar(): void {
    persistLayout({ sidebarCollapsed: !layout.sidebarCollapsed })
  }

  function toggleDetail(): void {
    persistLayout({ detailCollapsed: !layout.detailCollapsed })
  }

  function setSkin(nextSkin: SkinId): void {
    if (!config) return
    void saveConfig({ ui: { ...config.ui, skin: nextSkin } })
  }

  const configuredSkin = config?.ui.skin ?? DEFAULT_SKIN
  const skin = SKINS.some((s) => s.id === configuredSkin && s.ready) ? configuredSkin : DEFAULT_SKIN

  const modelOptions = (() => {
    const list = [...(canvasProvider?.models ?? [])]
    for (const extra of [canvas?.model, canvasProvider?.defaultModel]) {
      if (extra && !list.includes(extra)) list.push(extra)
    }
    return list
  })()

  const selectedNodeId = useAppStore((s) => s.selectedNodeId)
  const selectedNode = detail?.nodes.find((node) => node.id === selectedNodeId) ?? null
  const contextUsed = branchContextTokens(detail?.nodes ?? [], selectedNodeId)
  const contextWindow = canvasProvider?.contextWindow ?? DEFAULT_CONTEXT_WINDOW

  const activeProviderId = canvas?.providerId ?? config?.defaultProviderId ?? providers[0]?.id
  const activeProvider = providers.find((p) => p.id === activeProviderId)
  // 画布快照的 provider 可能已被删除（例如刚在设置里删掉）
  const canvasProviderMissing = Boolean(canvas) && providers.length > 0 && !canvasProvider

  async function changeProvider(providerId: string): Promise<void> {
    const provider = providers.find((p) => p.id === providerId)
    const model = provider?.defaultModel ?? provider?.models?.[0] ?? ''
    await setCanvasProvider(providerId, model)
  }

  async function commitModel(): Promise<void> {
    if (!canvas || modelDraft === canvas.model) return
    await setCanvasProvider(canvas.providerId, modelDraft.trim())
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-800 px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-200">Aiflow</span>
          {canvas && <span className="text-xs text-slate-400">{canvas.title}</span>}
          {isGenerating && <span className="text-xs text-indigo-300">生成中…</span>}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded border border-slate-700 p-0.5">
            {SKINS.map((item) => (
              <button
                type="button"
                key={item.id}
                disabled={!item.ready}
                title={item.ready ? item.label : `${item.label}视图待实现`}
                onClick={() => setSkin(item.id)}
                className={`rounded px-2 py-0.5 text-xs disabled:opacity-30 ${
                  skin === item.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {canvas ? (
            <div className="flex items-center gap-1" title="本画布使用的 Provider 与模型">
              <select
                className={`${selectClass} ${canvasProviderMissing ? 'border-rose-600 text-rose-200' : ''}`}
                value={canvasProvider ? canvas.providerId : ''}
                disabled={isGenerating || providers.length === 0}
                onChange={(e) => void changeProvider(e.target.value)}
              >
                {!canvasProvider && (
                  <option value="">
                    {providers.length > 0 ? `（原 Provider「${canvas.providerId}」已删除）` : canvas.providerId}
                  </option>
                )}
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name || provider.id}
                  </option>
                ))}
              </select>

              {modelOptions.length > 0 ? (
                <select
                  className={selectClass}
                  value={canvas.model}
                  disabled={isGenerating}
                  onChange={(e) => void setCanvasProvider(canvas.providerId, e.target.value)}
                >
                  {!canvas.model && <option value="">（未设置模型）</option>}
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={`${selectClass} w-40`}
                  value={modelDraft}
                  disabled={isGenerating}
                  placeholder="填写模型名"
                  onChange={(e) => setModelDraft(e.target.value)}
                  onBlur={() => void commitModel()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-500">未选择画布</span>
          )}

          {selectedNode && (
            <ContextRing
              used={contextUsed}
              total={contextWindow}
              label={selectedNode.title}
            />
          )}

          {detail && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
              画布总计 {formatTokens(detail.tokens.total)}
            </span>
          )}
        </div>
      </header>

      {providers.length === 0 && (
        <div className="border-b border-amber-700/40 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-200">
          还没有配置 Provider。点击左下角「设置」添加 Base URL 与 API Key 后即可新建画布。
        </div>
      )}

      {canvasProviderMissing && (
        <div className="border-b border-rose-700/60 bg-rose-500/10 px-4 py-1.5 text-xs text-rose-200">
          本画布原来使用的 Provider「{canvas?.providerId}」已被删除，请在顶栏为它重新选择一个 Provider。
        </div>
      )}

      {providers.length > 0 && !canvasProviderMissing && keyStatus && !keyStatus.hasKey && (
        <div className="border-b border-amber-700/40 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-200">
          尚未配置「{activeProvider?.name ?? activeProviderId}」的 API Key，请在「设置」里补上
          {canvas ? '，或在顶栏切换本画布的 Provider' : ''}。
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          width={layout.sidebarWidth}
          collapsed={layout.sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
        {!layout.sidebarCollapsed && (
          <PanelSplitter
            onMouseDown={beginResize('sidebar')}
            onDoubleClick={toggleSidebar}
            title="拖动调整宽度，双击收起"
          />
        )}

        <main className="relative min-w-0 flex-1">
          {skin === 'graph' ? <GraphCanvas /> : <TreeCanvas />}
        </main>

        {!layout.detailCollapsed && (
          <PanelSplitter
            onMouseDown={beginResize('detail')}
            onDoubleClick={toggleDetail}
            title="拖动调整宽度，双击收起"
          />
        )}
        <NodeDetail
          width={layout.detailWidth}
          collapsed={layout.detailCollapsed}
          onToggleCollapse={toggleDetail}
        />
      </div>

      <SettingsDialog />
      <NewCanvasDialog />

      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-rose-700/60 bg-rose-950/90 px-4 py-2 text-xs text-rose-100 shadow-lg">
          <span className="max-w-[600px]">{error}</span>
          <button type="button" onClick={clearError} className="text-rose-300">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
