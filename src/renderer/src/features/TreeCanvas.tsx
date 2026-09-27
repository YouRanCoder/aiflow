import { useEffect, useMemo, useRef, useState } from 'react'
import type { NodeWithTurns } from '@shared/types/domain'
import { ContextMenu, type MenuState } from './ContextMenu'
import { formatTokens, truncate } from '../lib/format'
import { computeBranchInfo } from '../lib/tokens'
import { useAppStore } from '../store/useAppStore'

function NodeRow({
  node,
  depth,
  byParent,
  branchInfo,
  onOpenMenu
}: {
  node: NodeWithTurns
  depth: number
  byParent: Map<string | null, NodeWithTurns[]>
  branchInfo: Map<string, { tokens: { total: number }; isLeaf: boolean; childCount: number }>
  onOpenMenu: (event: React.MouseEvent, nodeId: string) => void
}) {
  const selectedNodeId = useAppStore((s) => s.selectedNodeId)
  const generatingMap = useAppStore((s) => s.generating)
  const selectNode = useAppStore((s) => s.selectNode)
  const toggleCollapse = useAppStore((s) => s.toggleCollapse)

  const info = branchInfo.get(node.id)
  const children = byParent.get(node.id) ?? []
  const isSelected = selectedNodeId === node.id
  const generating = node.turns.some((turn) => generatingMap[turn.id])
  const hasError = node.turns.some((turn) => turn.messages.some((message) => message.error))
  const rowRef = useRef<HTMLDivElement>(null)

  // 从面包屑等地方跳过来时，把这一行滚进视野
  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isSelected])

  return (
    <div>
      <div
        ref={rowRef}
        role="button"
        tabIndex={0}
        onClick={() => selectNode(node.id)}
        onContextMenu={(event) => onOpenMenu(event, node.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') selectNode(node.id)
        }}
        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${
          isSelected ? 'bg-indigo-600/25 ring-1 ring-indigo-500/60' : 'hover:bg-slate-800/70'
        }`}
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void toggleCollapse(node.id)
            }}
            className="w-4 shrink-0 text-xs text-slate-400 hover:text-slate-200"
          >
            {node.collapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="w-4 shrink-0 text-xs text-slate-600">·</span>
        )}

        <span
          className={`flex-1 truncate ${
            hasError ? 'text-rose-300' : isSelected ? 'text-slate-100' : 'text-slate-300'
          }`}
        >
          {truncate(node.title, 44)}
        </span>

        {generating && <span className="shrink-0 text-xs text-indigo-300">生成中…</span>}
        <span className="shrink-0 rounded bg-slate-700/60 px-1 text-[10px] text-slate-300">
          {node.turns.length > 0 ? `${node.turns.length} 轮` : '还没提问'}
        </span>
        {node.summary && (
          <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] text-amber-300">
            已压缩
          </span>
        )}
        {info?.isLeaf && info.tokens.total > 0 && (
          <span className="shrink-0 rounded bg-slate-700/70 px-1.5 text-[10px] text-slate-300">
            {formatTokens(info.tokens.total)}
          </span>
        )}
      </div>

      {!node.collapsed &&
        children.map((child) => (
          <NodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            byParent={byParent}
            branchInfo={branchInfo}
            onOpenMenu={onOpenMenu}
          />
        ))}
    </div>
  )
}

export function TreeCanvas() {
  const detail = useAppStore((s) => s.detail)
  const addNode = useAppStore((s) => s.addNode)
  const renameNode = useAppStore((s) => s.renameNode)
  const removeNode = useAppStore((s) => s.removeNode)
  const toggleCollapse = useAppStore((s) => s.toggleCollapse)

  const [menu, setMenu] = useState<MenuState | null>(null)

  const byParent = useMemo(() => {
    const map = new Map<string | null, NodeWithTurns[]>()
    for (const node of detail?.nodes ?? []) {
      const list = map.get(node.parentId) ?? []
      list.push(node)
      map.set(node.parentId, list)
    }
    return map
  }, [detail])

  const branchInfo = useMemo(() => computeBranchInfo(detail?.nodes ?? []), [detail])

  const nodes = detail?.nodes ?? []
  const roots = byParent.get(null) ?? []

  function openNodeMenu(event: React.MouseEvent, nodeId: string): void {
    event.preventDefault()
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
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        选择或新建一个画布
      </div>
    )
  }

  if (roots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-slate-500">
        <span>还没有话题。</span>
        <span className="text-xs">在右侧写下根话题，点「创建根话题」把结构搭起来。</span>
        <span className="text-xs text-slate-600">
          这一步不会调用模型；提问请选中话题后在右侧输入。
        </span>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      {roots.map((root) => (
        <NodeRow
          key={root.id}
          node={root}
          depth={0}
          byParent={byParent}
          branchInfo={branchInfo}
          onOpenMenu={openNodeMenu}
        />
      ))}
      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  )
}
