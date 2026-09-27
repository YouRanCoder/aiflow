import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import type { Anchor, Node, Quote } from '@shared/types/domain'
import type { Db } from '../index'
import { messages, nodes, turns } from '../schema'
import { toNode, type NodeRow } from '../mappers'

export interface CreateNodeInput {
  canvasId: string
  parentId: string | null
  title: string
  anchor?: Anchor | null
  quote?: Quote | null
}

export function createNodeRepo(db: Db) {
  function rowById(id: string): NodeRow | undefined {
    return db.select().from(nodes).where(eq(nodes.id, id)).get() as NodeRow | undefined
  }

  function allInCanvas(canvasId: string): NodeRow[] {
    return db.select().from(nodes).where(eq(nodes.canvasId, canvasId)).all() as NodeRow[]
  }

  return {
    create(input: CreateNodeInput): Node {
      const now = Date.now()
      const siblings = input.parentId
        ? (db.select().from(nodes).where(eq(nodes.parentId, input.parentId)).all() as NodeRow[])
        : allInCanvas(input.canvasId).filter((n) => n.parentId === null)

      const row = {
        id: randomUUID(),
        canvasId: input.canvasId,
        parentId: input.parentId,
        title: input.title,
        anchorJson: input.anchor ? JSON.stringify(input.anchor) : null,
        quoteJson: input.quote ? JSON.stringify(input.quote) : null,
        summary: null,
        summaryCoversNodeId: null,
        collapsed: 0,
        posX: null,
        posY: null,
        orderIndex: siblings.length,
        createdAt: now,
        updatedAt: now
      }
      db.insert(nodes).values(row).run()
      return toNode(row as NodeRow)
    },

    get(id: string): Node | undefined {
      const row = rowById(id)
      return row ? toNode(row) : undefined
    },

    byCanvas(canvasId: string): Node[] {
      return allInCanvas(canvasId)
        .map(toNode)
        .sort((a, b) => a.createdAt - b.createdAt)
    },

    children(parentId: string): Node[] {
      return (db.select().from(nodes).where(eq(nodes.parentId, parentId)).all() as NodeRow[])
        .map(toNode)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    },

    /** 根 → 父，不含自身 */
    ancestors(nodeId: string): Node[] {
      const node = rowById(nodeId)
      if (!node) return []
      const byId = new Map(allInCanvas(node.canvasId).map((n) => [n.id, n]))
      const chain: Node[] = []
      let cursor = node.parentId
      while (cursor) {
        const current = byId.get(cursor)
        if (!current) break
        chain.push(toNode(current))
        cursor = current.parentId
      }
      return chain.reverse()
    },

    /** 含自身与所有后代 */
    subtree(nodeId: string): Node[] {
      const node = rowById(nodeId)
      if (!node) return []
      const all = allInCanvas(node.canvasId)
      const childrenOf = new Map<string, NodeRow[]>()
      for (const n of all) {
        if (!n.parentId) continue
        const list = childrenOf.get(n.parentId) ?? []
        list.push(n)
        childrenOf.set(n.parentId, list)
      }
      const out: Node[] = []
      const stack: NodeRow[] = [node]
      while (stack.length) {
        const current = stack.pop() as NodeRow
        out.push(toNode(current))
        for (const child of childrenOf.get(current.id) ?? []) stack.push(child)
      }
      return out
    },

    update(
      id: string,
      patch: Partial<
        Pick<Node, 'summary' | 'summaryCoversNodeId' | 'collapsed' | 'title'> & {
          posX: number
          posY: number
          anchor: Anchor | null
          quote: Quote | null
        }
      >
    ): void {
      const set: Record<string, unknown> = { updatedAt: Date.now() }
      if (patch.summary !== undefined) set.summary = patch.summary
      if (patch.summaryCoversNodeId !== undefined) set.summaryCoversNodeId = patch.summaryCoversNodeId
      if (patch.collapsed !== undefined) set.collapsed = patch.collapsed ? 1 : 0
      if (patch.title !== undefined) set.title = patch.title
      if (patch.posX !== undefined) set.posX = patch.posX
      if (patch.posY !== undefined) set.posY = patch.posY
      if (patch.anchor !== undefined) set.anchorJson = patch.anchor ? JSON.stringify(patch.anchor) : null
      if (patch.quote !== undefined) set.quoteJson = patch.quote ? JSON.stringify(patch.quote) : null
      db.update(nodes).set(set).where(eq(nodes.id, id)).run()
    },

    touch(id: string): void {
      db.update(nodes).set({ updatedAt: Date.now() }).where(eq(nodes.id, id)).run()
    },

    deleteSubtree(nodeId: string): void {
      const ids = this.subtree(nodeId).map((n) => n.id)
      if (ids.length === 0) return
      db.delete(messages).where(inArray(messages.nodeId, ids)).run()
      db.delete(turns).where(inArray(turns.nodeId, ids)).run()
      db.delete(nodes).where(inArray(nodes.id, ids)).run()
    }
  }
}

export type NodeRepo = ReturnType<typeof createNodeRepo>
