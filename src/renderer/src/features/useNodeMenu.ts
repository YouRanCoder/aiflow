import { useState } from 'react'
import type { NodeWithTurns } from '@shared/types/domain'
import { useAppStore } from '../store/useAppStore'
import type { MenuState } from './ContextMenu'

/**
 * 话题节点上的右键菜单。图皮肤与树皮肤共用这一份，两边的菜单项就不会走偏。
 * 返回的 menu 交给 <ContextMenu state={menu} onClose={closeMenu} /> 渲染。
 */
export function useNodeMenu(nodes: NodeWithTurns[]) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  const addNode = useAppStore((s) => s.addNode)
  const renameNode = useAppStore((s) => s.renameNode)
  const removeNode = useAppStore((s) => s.removeNode)
  const toggleCollapse = useAppStore((s) => s.toggleCollapse)
  const compact = useAppStore((s) => s.compact)
  const uncompact = useAppStore((s) => s.uncompact)
  const isGenerating = useAppStore((s) => s.isGenerating())
  const busy = useAppStore((s) => s.busy)

  function openNodeMenu(event: React.MouseEvent, nodeId: string): void {
    event.preventDefault()
    event.stopPropagation()

    const target = nodes.find((node) => node.id === nodeId)
    if (!target) return
    const childCount = nodes.filter((node) => node.parentId === nodeId).length
    const locked = isGenerating || busy

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
        // 压缩是相对「这个话题的祖先链」的操作，所以放在节点的右键菜单里
        target.summary
          ? {
              label: '撤销压缩，展开原文',
              title: '把这个话题的祖先摘要还原成完整问答',
              disabled: locked,
              onSelect: () => void uncompact(nodeId)
            }
          : {
              label: '压缩上下文',
              title: target.parentId
                ? '把祖先话题的全部问答压缩成一条摘要，保留原文可随时还原'
                : '根话题没有祖先，无需压缩',
              disabled: locked || !target.parentId,
              onSelect: () => void compact(nodeId)
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

  return { menu, openNodeMenu, closeMenu: () => setMenu(null) }
}
