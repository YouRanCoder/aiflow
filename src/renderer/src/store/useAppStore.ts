import { create } from 'zustand'
import type { Canvas, CanvasDetail, KeyStatus, TokenSum } from '@shared/types/domain'
import type { AppConfig } from '@shared/types/config'

interface AppState {
  config: AppConfig | null
  canvases: Canvas[]
  currentCanvasId: string | null
  detail: CanvasDetail | null
  selectedNodeId: string | null
  /** 以「轮」为键：同一话题可以有多轮同时存在 */
  generating: Record<string, boolean>
  streaming: Record<string, string>
  keyStatus: KeyStatus | null
  settingsOpen: boolean
  newCanvasOpen: boolean
  error: string | null
  busy: boolean

  init: () => Promise<void>
  loadConfig: () => Promise<void>
  loadCanvases: () => Promise<void>
  openCanvas: (id: string) => Promise<void>
  refreshDetail: () => Promise<void>
  selectNode: (id: string | null) => void
  createCanvas: (input: { title: string; description?: string }) => Promise<void>
  setCanvasProvider: (providerId: string, model: string) => Promise<void>

  /** 只建话题节点（不生成）；parentId 为 null 时即创建根话题 */
  addNode: (parentId: string | null, title: string, quote?: unknown) => Promise<string | null>
  renameNode: (nodeId: string, title: string) => Promise<void>
  /** 只加一轮提问（不生成） */
  addTurn: (nodeId: string, question: string) => Promise<string | null>
  /** 加一轮提问并立即生成 */
  askTurn: (nodeId: string, question: string) => Promise<void>
  /** 为已存在的轮次生成回答 */
  generateTurn: (turnId: string) => Promise<void>
  regenerate: (turnId: string) => Promise<void>
  removeTurn: (turnId: string) => Promise<void>
  /** 把某一轮问答提升为当前话题的子话题（那一轮移过去，不调模型） */
  promoteTurn: (turnId: string) => Promise<void>
  setActiveMessage: (turnId: string, messageId: string) => Promise<void>
  cancel: (turnId: string) => Promise<void>

  moveNode: (nodeId: string, x: number, y: number) => Promise<void>
  compact: (nodeId: string) => Promise<void>
  uncompact: (nodeId: string) => Promise<void>
  removeNode: (nodeId: string) => Promise<void>
  toggleCollapse: (nodeId: string) => Promise<void>
  saveConfig: (patch: Partial<AppConfig>) => Promise<void>
  refreshKeyStatus: (providerId: string) => Promise<void>
  setSettingsOpen: (open: boolean) => void
  setNewCanvasOpen: (open: boolean) => void
  clearError: () => void
  isGenerating: () => boolean
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export const useAppStore = create<AppState>((set, get) => ({
  config: null,
  canvases: [],
  currentCanvasId: null,
  detail: null,
  selectedNodeId: null,
  generating: {},
  streaming: {},
  keyStatus: null,
  settingsOpen: false,
  newCanvasOpen: false,
  error: null,
  busy: false,

  isGenerating: () => Object.keys(get().generating).length > 0,

  async init() {
    const offChunk = window.api.on.streamChunk((e) => {
      set((state) => ({
        generating: { ...state.generating, [e.turnId]: true },
        streaming: { ...state.streaming, [e.turnId]: (state.streaming[e.turnId] ?? '') + e.delta }
      }))
    })
    const offDone = window.api.on.streamDone(() => {
      void get().refreshDetail()
    })
    const offError = window.api.on.streamError((e) => {
      set((state) => {
        const generating = { ...state.generating }
        const streaming = { ...state.streaming }
        delete generating[e.turnId]
        delete streaming[e.turnId]
        return { generating, streaming, error: `${e.code}: ${e.message}` }
      })
      void get().refreshDetail()
    })

    void offChunk
    void offError
    void offDone

    await get().loadConfig()
    await get().loadCanvases()
    if (get().canvases.length > 0 && !get().currentCanvasId) {
      await get().openCanvas(get().canvases[0].id)
    }
  },

  async loadConfig() {
    try {
      const config = await window.api.config.get()
      set({ config })
      const canvasProviderId = get().detail?.canvas.providerId
      const providerId = canvasProviderId ?? config.defaultProviderId ?? config.providers[0]?.id
      set({ keyStatus: providerId ? await window.api.secrets.status(providerId) : null })
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async loadCanvases() {
    try {
      set({ canvases: await window.api.canvas.list() })
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async openCanvas(id) {
    try {
      const detail = await window.api.canvas.get(id)
      const rootId = detail.nodes.find((n) => n.parentId === null)?.id ?? null
      set({
        currentCanvasId: id,
        detail,
        selectedNodeId: rootId,
        generating: {},
        streaming: {}
      })
      await get().refreshKeyStatus(detail.canvas.providerId)
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async refreshDetail() {
    const canvasId = get().currentCanvasId
    if (!canvasId) return
    try {
      const detail = await window.api.canvas.get(canvasId)
      set((state) => {
        const generating = { ...state.generating }
        const streaming = { ...state.streaming }
        // 已落库（有内容或错误）的轮次视为完成
        for (const node of detail.nodes) {
          for (const turn of node.turns) {
            const active = turn.messages.find((m) => m.isActive)
            if (active && (active.content.length > 0 || active.error)) {
              delete generating[turn.id]
              delete streaming[turn.id]
            }
          }
        }
        return { detail, generating, streaming }
      })
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  selectNode(id) {
    if (get().isGenerating()) return
    set({ selectedNodeId: id })
  },

  async createCanvas({ title, description }) {
    try {
      set({ busy: true })
      const config = get().config
      const providerId = config?.defaultProviderId ?? config?.providers[0]?.id
      if (!providerId) {
        set({ error: '尚未配置 Provider，请先在设置中添加' })
        return
      }
      const provider = config?.providers.find((p) => p.id === providerId)

      const canvas = await window.api.canvas.create({
        title,
        description: description?.trim() || undefined,
        providerId,
        model: provider?.defaultModel ?? provider?.models?.[0] ?? ''
      })

      await get().loadCanvases()
      await get().openCanvas(canvas.id)
      set({ newCanvasOpen: false })
    } catch (err) {
      set({ error: errMessage(err) })
    } finally {
      set({ busy: false })
    }
  },

  async setCanvasProvider(providerId, model) {
    const canvasId = get().currentCanvasId
    if (!canvasId) return
    try {
      await window.api.canvas.update(canvasId, providerId, model)
      await get().refreshDetail()
      await get().refreshKeyStatus(providerId)
      await get().loadCanvases()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async addNode(parentId, title, quote) {
    const canvasId = get().currentCanvasId
    if (!canvasId) return null
    try {
      const { nodeId } = await window.api.node.create({
        canvasId,
        parentId,
        title,
        quote: quote ?? null
      })
      await get().refreshDetail()
      set({ selectedNodeId: nodeId })
      return nodeId
    } catch (err) {
      set({ error: errMessage(err) })
      return null
    }
  },

  async renameNode(nodeId, title) {
    try {
      await window.api.node.rename(nodeId, title)
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async addTurn(nodeId, question) {
    try {
      const { turnId } = await window.api.turn.add(nodeId, question)
      await get().refreshDetail()
      return turnId
    } catch (err) {
      set({ error: errMessage(err) })
      return null
    }
  },

  async askTurn(nodeId, question) {
    try {
      const { turnId } = await window.api.turn.ask(nodeId, question)
      set((state) => ({
        generating: { ...state.generating, [turnId]: true },
        streaming: { ...state.streaming, [turnId]: '' },
        selectedNodeId: nodeId
      }))
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async generateTurn(turnId) {
    try {
      await window.api.turn.generate(turnId)
      set((state) => ({
        generating: { ...state.generating, [turnId]: true },
        streaming: { ...state.streaming, [turnId]: '' }
      }))
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async regenerate(turnId) {
    try {
      await window.api.turn.regenerate(turnId)
      set((state) => ({
        generating: { ...state.generating, [turnId]: true },
        streaming: { ...state.streaming, [turnId]: '' }
      }))
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async removeTurn(turnId) {
    try {
      await window.api.turn.remove(turnId)
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async promoteTurn(turnId) {
    try {
      const { nodeId } = await window.api.turn.promote(turnId)
      await get().refreshDetail()
      set({ selectedNodeId: nodeId })
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async setActiveMessage(turnId, messageId) {
    try {
      await window.api.turn.setActiveMessage(turnId, messageId)
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async cancel(turnId) {
    try {
      await window.api.turn.cancel(turnId)
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async moveNode(nodeId, x, y) {
    try {
      await window.api.node.move(nodeId, x, y)
      // 本地同步坐标，避免下一次布局把节点弹回自动位置
      set((state) =>
        state.detail
          ? {
              detail: {
                ...state.detail,
                nodes: state.detail.nodes.map((node) =>
                  node.id === nodeId ? { ...node, posX: x, posY: y } : node
                )
              }
            }
          : {}
      )
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async compact(nodeId) {
    try {
      set({ busy: true })
      await window.api.node.compact(nodeId)
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    } finally {
      set({ busy: false })
    }
  },

  async uncompact(nodeId) {
    try {
      await window.api.node.uncompact(nodeId)
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async removeNode(nodeId) {
    try {
      await window.api.node.remove(nodeId)
      if (get().selectedNodeId === nodeId) set({ selectedNodeId: null })
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async toggleCollapse(nodeId) {
    const node = get().detail?.nodes.find((n) => n.id === nodeId)
    if (!node) return
    try {
      await window.api.node.collapse(nodeId, !node.collapsed)
      await get().refreshDetail()
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async saveConfig(patch) {
    try {
      const config = await window.api.config.set(patch)
      set({ config })
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  async refreshKeyStatus(providerId) {
    try {
      set({ keyStatus: await window.api.secrets.status(providerId) })
    } catch (err) {
      set({ error: errMessage(err) })
    }
  },

  setSettingsOpen(open) {
    set({ settingsOpen: open })
  },

  setNewCanvasOpen(open) {
    set({ newCanvasOpen: open })
  },

  clearError() {
    set({ error: null })
  }
}))

export function useCanvasTokens(): TokenSum {
  return (
    useAppStore((state) => state.detail?.tokens) ?? { prompt: 0, completion: 0, cached: 0, total: 0 }
  )
}
