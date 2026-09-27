import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Turn } from '@shared/types/domain'
import type { Db } from '../index'
import { turns } from '../schema'
import { toTurn, type TurnRow } from '../mappers'

export interface CreateTurnInput {
  nodeId: string
  question: string
}

export function createTurnRepo(db: Db) {
  function rowsByNode(nodeId: string): TurnRow[] {
    return db.select().from(turns).where(eq(turns.nodeId, nodeId)).all() as TurnRow[]
  }

  return {
    create(input: CreateTurnInput): Turn {
      const now = Date.now()
      const row = {
        id: randomUUID(),
        nodeId: input.nodeId,
        question: input.question,
        orderIndex: rowsByNode(input.nodeId).length,
        createdAt: now,
        updatedAt: now
      }
      db.insert(turns).values(row).run()
      return toTurn(row as TurnRow)
    },

    get(id: string): Turn | undefined {
      const row = db.select().from(turns).where(eq(turns.id, id)).get() as TurnRow | undefined
      return row ? toTurn(row) : undefined
    },

    byNode(nodeId: string): Turn[] {
      return rowsByNode(nodeId)
        .map(toTurn)
        .sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)
    },

    update(id: string, patch: { question?: string }): void {
      const set: Record<string, unknown> = { updatedAt: Date.now() }
      if (patch.question !== undefined) set.question = patch.question
      db.update(turns).set(set).where(eq(turns.id, id)).run()
    },

    /** 把一轮挪到另一个话题下（成为该话题的第 0 轮） */
    move(id: string, nodeId: string): void {
      db.update(turns)
        .set({ nodeId, orderIndex: 0, updatedAt: Date.now() })
        .where(eq(turns.id, id))
        .run()
    },

    /** 删除后把话题内轮次顺序压紧，避免 order_index 出现空洞 */
    reindex(nodeId: string): void {
      const rows = rowsByNode(nodeId).sort(
        (a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt
      )
      rows.forEach((row, index) => {
        if (row.orderIndex !== index) {
          db.update(turns)
            .set({ orderIndex: index, updatedAt: Date.now() })
            .where(eq(turns.id, row.id))
            .run()
        }
      })
    },

    delete(id: string): void {
      db.delete(turns).where(eq(turns.id, id)).run()
    },

    deleteByNode(nodeId: string): void {
      db.delete(turns).where(eq(turns.nodeId, nodeId)).run()
    }
  }
}

export type TurnRepo = ReturnType<typeof createTurnRepo>
