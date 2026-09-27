import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Canvas } from '@shared/types/domain'
import type { Db } from '../index'
import { canvases } from '../schema'
import { toCanvas, type CanvasRow } from '../mappers'

export interface CreateCanvasInput {
  title: string
  description?: string | null
  providerId: string
  model: string
  params?: Record<string, unknown> | null
}

export function createCanvasRepo(db: Db) {
  return {
    create(input: CreateCanvasInput): Canvas {
      const now = Date.now()
      const row = {
        id: randomUUID(),
        title: input.title,
        description: input.description ?? null,
        rootNodeId: null,
        providerId: input.providerId,
        model: input.model,
        paramsJson: input.params ? JSON.stringify(input.params) : null,
        createdAt: now,
        updatedAt: now
      }
      db.insert(canvases).values(row).run()
      return toCanvas(row as CanvasRow)
    },

    get(id: string): Canvas | undefined {
      const row = db.select().from(canvases).where(eq(canvases.id, id)).get()
      return row ? toCanvas(row as CanvasRow) : undefined
    },

    list(): Canvas[] {
      const rows = db.select().from(canvases).all()
      return rows.map((r) => toCanvas(r as CanvasRow)).sort((a, b) => b.updatedAt - a.updatedAt)
    },

    update(
      id: string,
      patch: Partial<Pick<Canvas, 'title' | 'description' | 'rootNodeId' | 'providerId' | 'model'>>
    ): void {
      const now = Date.now()
      db.update(canvases)
        .set({ ...patch, updatedAt: now })
        .where(eq(canvases.id, id))
        .run()
    },

    /** 把仍指向某个 provider 的画布改接到新 provider；返回改接数量。 */
    retargetProvider(fromProviderId: string, toProviderId: string, model: string): number {
      const rows = db.select().from(canvases).where(eq(canvases.providerId, fromProviderId)).all()
      const now = Date.now()
      for (const row of rows) {
        db.update(canvases)
          .set({ providerId: toProviderId, model, updatedAt: now })
          .where(eq(canvases.id, row.id))
          .run()
      }
      return rows.length
    },

    touch(id: string): void {
      db.update(canvases).set({ updatedAt: Date.now() }).where(eq(canvases.id, id)).run()
    },

    delete(id: string): void {
      db.delete(canvases).where(eq(canvases.id, id)).run()
    }
  }
}

export type CanvasRepo = ReturnType<typeof createCanvasRepo>
