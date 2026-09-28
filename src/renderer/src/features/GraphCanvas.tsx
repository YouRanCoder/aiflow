import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node as FlowNode,
  type NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { NodeWithTurns } from '@shared/types/domain'
import { ContextMenu, type MenuState } from './ContextMenu'
import { formatTokens, truncate } from '../lib/format'
import { computeTreeLayout } from '../lib/layout'
import { computeBranchInfo } from '../lib/tokens'
import { useAppStore } from '../store/useAppStore'

const NODE_WIDTH = 208
const COLUMN_WIDTH = 290
const ROW_HEIGHT = 116

/** 状态用「圆点 + 文字」表达，不用填色药丸；色弱用户靠文字也能读出来 */
function StateDot({ tone, children }: { tone: 'accent' | 'danger' | 'warn'; children: React.ReactNode }) {
  const dot = tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-accent'
  const text =
    tone === 'danger' ? 'text-danger-text' : tone === 'warn' ? 'text-warn-text' : 'text-accent-text'
  return (
    <span className={`flex items-center gap-1 ${text}`}>
      <span className={`h-1 w-1 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  )
}

interface TopicData extends Record<string, unknown> {
  title: string
  turnCount: number
  selected: boolean
  generating: boolean
  failed: boolean
  summarized: boolean
  collapsed: boolean
  childCount: number
  tokens: number
  isLeaf: boolean
  locked: boolean
  onToggleCollapse: (nodeId: string) => void
  onOpenMenu: (event: React.MouseEvent, nodeId: string) => void
}

function TopicNode({ id, data }: NodeProps) {
  const node = data as unknown as TopicData
  return (
    <div
      style={{ width: NODE_WIDTH }}
      onContextMenu={(event) => node.onOpenMenu(event, id)}
      className={`cursor-context-menu rounded-md border px-3 py-2 text-left transition-colors ${
        node.selected
          ? 'border-accent bg-accent-soft'
          : 'border-line bg-raised hover:border-line-strong'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-line-strong" />

      <div className="flex items-start gap-1">
        <span className="flex-1 text-xs leading-snug text-fg">{truncate(node.title, 44)}</span>
        {node.childCount > 0 && (
          <button
            type="button"
            disabled={node.locked}
            title={node.collapsed ? '展开子节点' : '折叠子节点'}
            aria-label={node.collapsed ? '展开子节点' : '折叠子节点'}
            onClick={(event) => {
              event.stopPropagation()
              node.onToggleCollapse(id)
            }}
            className="shrink-0 rounded px-1 text-2xs text-faint transition-colors hover:text-fg disabled:opacity-40"
          >
            {node.collapsed ? `▸${node.childCount}` : '▾'}
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
        {node.generating && <StateDot tone="accent">生成中</StateDot>}
        <span className="tnum text-faint">
          {node.turnCount > 0 ? `${node.turnCount} 轮` : '还没提问'}
        </span>
        {node.failed && <StateDot tone="danger">失败</StateDot>}
        {node.summarized && <StateDot tone="warn">已压缩</StateDot>}
        {node.isLeaf && node.tokens > 0 && (
          <span className="tnum ml-auto text-faint">{formatTokens(node.tokens)}</span>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-line-strong" />
    </div>
  )
}

const nodeTypes = { topic: TopicNode }

/**
 * React Flow 的内部各层都是 `position: absolute; height: 100%`，而根元素 `.react-flow`
 * 自身不带尺寸，所以必须由我们给它确定高度——否则高度塌成 0，画布一片空白。
 */
const REACT_FLOW_CLASS = 'h-full w-full'

export function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  )
}

function GraphInner() {
  const detail = useAppStore((s) => s.detail)
  const selectedNodeId = useAppStore((s) => s.selectedNodeId)
  const generatingMap = useAppStore((s) => s.generating)
  const isGenerating = useAppStore((s) => s.isGenerating())
  const selectNode = useAppStore((s) => s.selectNode)
  const moveNode = useAppStore((s) => s.moveNode)
  const toggleCollapse = useAppStore((s) => s.toggleCollapse)
  const addNode = useAppStore((s) => s.addNode)
  const renameNode = useAppStore((s) => s.renameNode)
  const removeNode = useAppStore((s) => s.removeNode)

  const { fitView } = useReactFlow()
  const [rootDraft, setRootDraft] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)
  const lastSelectionFromGraphRef = useRef(false)

  const nodes = useMemo(() => detail?.nodes ?? [], [detail])

  const layout = useMemo(
    () => computeTreeLayout(nodes, { columnWidth: COLUMN_WIDTH, rowHeight: ROW_HEIGHT }),
    [nodes]
  )
  const branchInfo = useMemo(() => computeBranchInfo(nodes), [nodes])

  /** 折叠节点时，其所有后代也要隐藏 */
  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>()
    const childrenOf = new Map<string, NodeWithTurns[]>()
    for (const node of nodes) {
      if (!node.parentId) continue
      const list = childrenOf.get(node.parentId) ?? []
      list.push(node)
      childrenOf.set(node.parentId, list)
    }
    const stack = nodes.filter((node) => node.collapsed).map((node) => node.id)
    while (stack.length > 0) {
      const current = stack.pop() as string
      for (const child of childrenOf.get(current) ?? []) {
        if (hidden.has(child.id)) continue
        hidden.add(child.id)
        stack.push(child.id)
      }
    }
    return hidden
  }, [nodes])

  /** 必须在渲染期同步算出来：React Flow 首次挂载时若拿到空数组，fitView 会落空 */
  const baseNodes = useMemo<FlowNode[]>(
    () =>
      nodes
        .filter((node) => !hiddenIds.has(node.id))
        .map((node) => {
          const info = branchInfo.get(node.id)
          const data: TopicData = {
            title: node.title,
            turnCount: node.turns.length,
            selected: node.id === selectedNodeId,
            generating: node.turns.some((turn) => generatingMap[turn.id]),
            failed: node.turns.some((turn) => turn.messages.some((message) => message.error)),
            summarized: Boolean(node.summary),
            collapsed: node.collapsed,
            childCount: info?.childCount ?? 0,
            tokens: info?.tokens.total ?? 0,
            isLeaf: info?.isLeaf ?? true,
            locked: isGenerating,
            onToggleCollapse: (nodeId) => void toggleCollapse(nodeId),
            onOpenMenu: (event, nodeId) => openNodeMenu(event, nodeId)
          }
          return {
            id: node.id,
            type: 'topic',
            position: layout.get(node.id) ?? { x: 0, y: 0 },
            data
          }
        }),
    [nodes, hiddenIds, layout, branchInfo, selectedNodeId, generatingMap, isGenerating, toggleCollapse]
  )

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowNode>(baseNodes)

  // 渲染期同步（React 官方的「props 变化时重置 state」写法）：拖动只改 flowNodes、不改 baseNodes，
  // 所以拖拽不会被重置；而 detail 变化会立刻反映到画布上，不会晚一帧。
  const appliedBase = useRef<FlowNode[] | null>(null)
  if (appliedBase.current !== baseNodes) {
    appliedBase.current = baseNodes
    setFlowNodes(baseNodes)
  }

  const edges = useMemo<Edge[]>(() => {
    const visible = new Set(flowNodes.map((node) => node.id))
    return nodes
      .filter((node) => node.parentId && visible.has(node.id) && visible.has(node.parentId))
      .map((node) => ({
        id: `${node.parentId}->${node.id}`,
        source: node.parentId as string,
        target: node.id,
        animated: Boolean(generatingMap[node.id])
      }))
  }, [nodes, flowNodes, generatingMap])

  // 面包屑等「外部」选中时，把该话题平移进视野（在图里自己点选就不打扰了）
  useEffect(() => {
    if (!selectedNodeId) return
    if (lastSelectionFromGraphRef.current) {
      lastSelectionFromGraphRef.current = false
      return
    }
    const frame = requestAnimationFrame(() => {
      void fitView({ nodes: [{ id: selectedNodeId }], duration: 300, padding: 0.6, maxZoom: 1 })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedNodeId, fitView])

  // 画布切换、或新增节点后重新适配视图，否则新节点会落在视野外
  const canvasId = detail?.canvas.id ?? null
  const lastFit = useRef<{ canvas: string | null; count: number }>({ canvas: null, count: 0 })
  useEffect(() => {
    const previous = lastFit.current
    const shouldFit =
      baseNodes.length > 0 && (previous.canvas !== canvasId || baseNodes.length > previous.count)
    lastFit.current = { canvas: canvasId, count: baseNodes.length }
    if (!shouldFit) return
    // 等节点被测出尺寸再适配，否则包围盒是 0
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.25, maxZoom: 1.25, duration: 200 })
    })
    return () => cancelAnimationFrame(frame)
  }, [canvasId, baseNodes.length, fitView])

  const handleDragStop = useCallback(
    (_event: unknown, node: FlowNode) => {
      void moveNode(node.id, node.position.x, node.position.y)
    },
    [moveNode]
  )

  async function submitRoot(): Promise<void> {
    const title = rootDraft.trim()
    if (!title) return
    setRootDraft('')
    await addNode(null, title)
  }

  /** 在话题卡片上右键 */
  function openNodeMenu(event: React.MouseEvent, nodeId: string): void {
    event.preventDefault()
    event.stopPropagation()
    const target = nodes.find((node) => node.id === nodeId)
    if (!target) return
    const childCount = nodes.filter((node) => node.parentId === nodeId).length

    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: '添加子话题',
          input: {
            placeholder: '子话题名，例如「什么是地址」',
            onSubmit: (value) => void addNode(nodeId, value)
          }
        },
        {
          label: '重命名话题',
          input: {
            placeholder: '话题名',
            initial: target.title,
            onSubmit: (value) => void renameNode(nodeId, value)
          }
        },
        {
          label: target.collapsed ? '展开子话题' : '折叠子话题',
          disabled: childCount === 0,
          onSelect: () => void toggleCollapse(nodeId)
        },
        {
          label: '删除该话题及其子话题',
          danger: true,
          confirmLabel: '再点一次确认删除',
          onConfirm: () => void removeNode(nodeId)
        }
      ]
    })
  }

  if (!detail) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-faint">
        选择或新建一个画布
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="w-[440px] rounded-lg border border-line bg-raised p-5">
          <div className="text-sm font-medium text-fg">这是一张空画布</div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            先写下根话题（例如「C语言指针」），再在话题上
            <b className="font-medium text-fg">右键 →「添加子话题」</b>
            把结构搭出来。这一步<strong className="font-medium text-fg">不会调用模型</strong>；
            想提问时选中话题，在右侧输入框提问即可。
          </p>
          <form
            className="mt-3.5 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void submitRoot()
            }}
          >
            <input
              autoFocus
              aria-label="根话题"
              value={rootDraft}
              onChange={(event) => setRootDraft(event.target.value)}
              placeholder="例如：C语言指针"
              className="flex-1 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm text-fg transition-colors placeholder:text-faint focus:border-accent-line"
            />
            <button
              type="submit"
              disabled={!rootDraft.trim()}
              className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              创建根节点
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 bg-canvas">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => {
          lastSelectionFromGraphRef.current = true
          selectNode(node.id)
        }}
        onPaneClick={() => selectNode(null)}
        onNodeDragStop={handleDragStop}
        nodesDraggable={!isGenerating}
        nodesConnectable={false}
        edgesFocusable={false}
        minZoom={0.2}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.25 }}
        className={REACT_FLOW_CLASS}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color="oklch(var(--c-line))"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}
