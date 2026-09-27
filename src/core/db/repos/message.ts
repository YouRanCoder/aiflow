import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Message, MessageRole } from '@shared/types/domain'
import type { Db } from '../index'
import { messages } from '../schema'
import { toMessage, type MessageRow } from '../mappers'

export interface AddMessageInput {
  turnId: string
  /** 冗余列，便于按节点级联删除与画布汇总 */
  nodeId: string
  role: MessageRole
  content: string
  isActive?: boolean
  providerId?: string | null
  model?: string | null
}

export interface MessageUsage {
  usagePrompt: number
  usageCompletion: number
  usageCached: number
}

export function createMessageRepo(db: Db) {
  return {
    add(input: AddMessageInput): Message {
      const row = {
        id: randomUUID(),
        turnId: input.turnId,
        nodeId: input.nodeId,
        role: input.role,
        content: input.content,
        isActive: input.isActive ? 1 : 0,
        providerId: input.providerId ?? null,
        model: input.model ?? null,
        usagePrompt: 0,
        usageCompletion: 0,
        usageCached: 0,
        error: null,
        createdAt: Date.now()
      }
      db.insert(messages).values(row).run()
      return toMessage(row as MessageRow)
    },

    get(id: string): Message | undefined {
      const row = db.select().from(messages).where(eq(messages.id, id)).get() as MessageRow | undefined
      return row ? toMessage(row) : undefined
    },

    listByTurn(turnId: string): Message[] {
      return (db.select().from(messages).where(eq(messages.turnId, turnId)).all() as MessageRow[])
        .map(toMessage)
        .sort((a, b) => a.createdAt - b.createdAt)
    },

    getActiveByTurn(turnId: string): Message | undefined {
      const row = db
        .select()
        .from(messages)
        .where(and(eq(messages.turnId, turnId), eq(messages.isActive, 1)))
        .get() as MessageRow | undefined
      return row ? toMessage(row) : undefined
    },

    listByNode(nodeId: string): Message[] {
      return (db.select().from(messages).where(eq(messages.nodeId, nodeId)).all() as MessageRow[])
        .map(toMessage)
        .sort((a, b) => a.createdAt - b.createdAt)
    },

    appendContent(id: string, delta: string): void {
      const current = this.get(id)
      if (!current) return
      db.update(messages)
        .set({ content: current.content + delta })
        .where(eq(messages.id, id))
        .run()
    },

    finish(id: string, usage: MessageUsage, content?: string): void {
      const set: Record<string, unknown> = {
        usagePrompt: usage.usagePrompt,
        usageCompletion: usage.usageCompletion,
        usageCached: usage.usageCached
      }
      if (content !== undefined) set.content = content
      db.update(messages).set(set).where(eq(messages.id, id)).run()
    },

    fail(id: string, error: string): void {
      db.update(messages).set({ error }).where(eq(messages.id, id)).run()
    },

    /** 同一轮里只保留一个 active 版本 */
    setActive(turnId: string, messageId: string): void {
      db.update(messages).set({ isActive: 0 }).where(eq(messages.turnId, turnId)).run()
      db.update(messages).set({ isActive: 1 }).where(eq(messages.id, messageId)).run()
    },

    /** 轮次换话题时，冗余的 node_id 必须一起改，否则级联删除与按话题查询会错位 */
    reassignNode(turnId: string, nodeId: string): void {
      db.update(messages).set({ nodeId }).where(eq(messages.turnId, turnId)).run()
    },

    deleteByTurn(turnId: string): void {
      db.delete(messages).where(eq(messages.turnId, turnId)).run()
    },

    deleteByNode(nodeId: string): void {
      db.delete(messages).where(eq(messages.nodeId, nodeId)).run()
    }
  }
}

export type MessageRepo = ReturnType<typeof createMessageRepo>
