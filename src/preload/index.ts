import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type {
  ApiResult,
  StreamChunkEvent,
  StreamDoneEvent,
  StreamErrorEvent
} from '@shared/contract'
import type { Canvas, CanvasDetail, KeyStatus, TokenSum } from '@shared/types/domain'
import type { AppConfig } from '@shared/types/config'

async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as ApiResult<T>
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new Error(`IPC 返回无效: ${channel}`)
  }
  if (!result.ok) {
    const error = new Error(result.error.message) as Error & { code?: string }
    error.code = result.error.code
    throw error
  }
  return result.data
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  ping: (): Promise<string> => call<string>(IPC.appPing),

  config: {
    get: (): Promise<AppConfig> => call<AppConfig>(IPC.configGet),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> => call<AppConfig>(IPC.configSet, patch)
  },

  secrets: {
    available: (): Promise<boolean> => call<boolean>(IPC.secretsAvailable),
    status: (providerId: string): Promise<KeyStatus> => call<KeyStatus>(IPC.secretsStatus, { providerId }),
    set: (providerId: string, key: string): Promise<KeyStatus> =>
      call<KeyStatus>(IPC.secretsSet, { providerId, key }),
    remove: (providerId: string): Promise<KeyStatus> =>
      call<KeyStatus>(IPC.secretsRemove, { providerId })
  },

  providers: {
    listModels: (providerId: string): Promise<string[]> =>
      call<string[]>(IPC.providersListModels, { providerId }),
    test: (providerId: string): Promise<{ ok: boolean; models: number; error?: string }> =>
      call<{ ok: boolean; models: number; error?: string }>(IPC.providersTest, { providerId }),
    delete: (providerId: string): Promise<AppConfig> =>
      call<AppConfig>(IPC.providersDelete, { providerId })
  },

  canvas: {
    create: (input: {
      title: string
      description?: string
      providerId?: string
      model?: string
    }): Promise<Canvas> => call<Canvas>(IPC.canvasCreate, input),
    list: (): Promise<Canvas[]> => call<Canvas[]>(IPC.canvasList),
    get: (id: string): Promise<CanvasDetail> => call<CanvasDetail>(IPC.canvasGet, { id }),
    update: (id: string, providerId: string, model: string): Promise<boolean> =>
      call<boolean>(IPC.canvasUpdate, { id, providerId, model }),
    rename: (id: string, title: string): Promise<boolean> =>
      call<boolean>(IPC.canvasRename, { id, title }),
    remove: (id: string): Promise<boolean> => call<boolean>(IPC.canvasDelete, { id })
  },

  node: {
    create: (input: {
      canvasId: string
      parentId: string | null
      title: string
      quote?: unknown
      anchor?: unknown
    }): Promise<{ nodeId: string }> => call<{ nodeId: string }>(IPC.nodeCreate, input),
    rename: (nodeId: string, title: string): Promise<boolean> =>
      call<boolean>(IPC.nodeRename, { nodeId, title }),
    compact: (nodeId: string): Promise<boolean> => call<boolean>(IPC.nodeCompact, { nodeId }),
    uncompact: (nodeId: string): Promise<boolean> => call<boolean>(IPC.nodeUncompact, { nodeId }),
    remove: (nodeId: string): Promise<boolean> => call<boolean>(IPC.nodeDelete, { nodeId }),
    collapse: (nodeId: string, collapsed: boolean): Promise<boolean> =>
      call<boolean>(IPC.nodeCollapse, { nodeId, collapsed }),
    move: (nodeId: string, x: number, y: number): Promise<boolean> =>
      call<boolean>(IPC.nodeMove, { nodeId, x, y })
  },

  turn: {
    add: (nodeId: string, question: string): Promise<{ turnId: string }> =>
      call<{ turnId: string }>(IPC.turnAdd, { nodeId, question }),
    ask: (nodeId: string, question: string): Promise<{ turnId: string; messageId: string }> =>
      call<{ turnId: string; messageId: string }>(IPC.turnAsk, { nodeId, question }),
    generate: (turnId: string): Promise<{ turnId: string; messageId: string }> =>
      call<{ turnId: string; messageId: string }>(IPC.turnGenerate, { turnId }),
    regenerate: (turnId: string): Promise<{ turnId: string; messageId: string }> =>
      call<{ turnId: string; messageId: string }>(IPC.turnRegenerate, { turnId }),
    remove: (turnId: string): Promise<boolean> => call<boolean>(IPC.turnDelete, { turnId }),
    promote: (turnId: string): Promise<{ nodeId: string }> =>
      call<{ nodeId: string }>(IPC.turnPromote, { turnId }),
    setActiveMessage: (turnId: string, messageId: string): Promise<boolean> =>
      call<boolean>(IPC.turnSetActiveMessage, { turnId, messageId }),
    cancel: (turnId: string): Promise<boolean> => call<boolean>(IPC.generateCancel, { turnId })
  },

  tokens: {
    canvas: (canvasId: string): Promise<TokenSum> => call<TokenSum>(IPC.tokensCanvas, { canvasId }),
    branch: (nodeId: string): Promise<TokenSum> => call<TokenSum>(IPC.tokensBranch, { nodeId }),
    node: (nodeId: string): Promise<TokenSum> => call<TokenSum>(IPC.tokensNode, { nodeId })
  },

  on: {
    streamChunk: (cb: (e: StreamChunkEvent) => void): (() => void) =>
      subscribe<StreamChunkEvent>(IPC.streamChunk, cb),
    streamDone: (cb: (e: StreamDoneEvent) => void): (() => void) =>
      subscribe<StreamDoneEvent>(IPC.streamDone, cb),
    streamError: (cb: (e: StreamErrorEvent) => void): (() => void) =>
      subscribe<StreamErrorEvent>(IPC.streamError, cb)
  }
}

export type PreloadApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  window.api = api
}
