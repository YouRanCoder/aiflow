import { ipcMain } from 'electron'
import type { ZodTypeAny } from 'zod'
import { IPC } from '@shared/constants'
import { requestSchemas, type ApiResult } from '@shared/contract'
import type { CanvasDetail, KeyStatus, TokenSum } from '@shared/types/domain'
import { loadConfig, patchConfig, removeProvider } from '@core/config'
import { deleteKey, getKeyStatus, isEncryptionAvailable, setKey } from '@core/secrets'
import { listModels, testConnection } from '@core/llm/openai'
import type { Session } from '../services/session'
import { resolveCredentials } from '../services/credentials'

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ApiResult<never> {
  return { ok: false, error: { code, message } }
}

export function registerIpc(session: Session): void {
  const credentials = resolveCredentials

  function handle<T>(channel: string, fn: (payload: any) => T | Promise<T>): void {
    const schema = (requestSchemas as Record<string, ZodTypeAny | undefined>)[channel]
    ipcMain.handle(channel, async (_event, payload: unknown): Promise<ApiResult<T>> => {
      try {
        const parsed = schema ? schema.parse(payload) : payload
        return ok(await fn(parsed))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return fail('ERROR', message)
      }
    })
  }

  handle(IPC.appPing, () => 'pong')

  handle(IPC.configGet, () => loadConfig())
  handle(IPC.configSet, (patch) => patchConfig(patch))

  handle(IPC.secretsAvailable, () => isEncryptionAvailable())
  handle(IPC.secretsStatus, ({ providerId }: { providerId: string }): KeyStatus => getKeyStatus(providerId))
  handle(IPC.secretsSet, ({ providerId, key }: { providerId: string; key: string }): KeyStatus => {
    setKey(providerId, key)
    return getKeyStatus(providerId)
  })
  handle(IPC.secretsRemove, ({ providerId }: { providerId: string }): KeyStatus => {
    deleteKey(providerId)
    return getKeyStatus(providerId)
  })

  handle(IPC.providersListModels, async ({ providerId }: { providerId: string }) => {
    const runtime = credentials(providerId)
    if (!runtime) throw new Error('未配置该 Provider 的 API Key')
    return listModels(runtime.baseURL, runtime.apiKey)
  })
  handle(IPC.providersTest, async ({ providerId }: { providerId: string }) => {
    const runtime = credentials(providerId)
    if (!runtime) return { ok: false, models: 0, error: '未配置该 Provider 的 API Key' }
    return testConnection(runtime.baseURL, runtime.apiKey)
  })
  handle(IPC.providersDelete, ({ providerId }: { providerId: string }) => {
    deleteKey(providerId)
    const config = removeProvider(providerId)

    // 画布在创建时把 provider/model 快照了下来，删掉 provider 后要把这些画布接到新默认项上，
    // 否则它们会永远指向一个不存在的 provider。
    const fallbackId = config.defaultProviderId ?? config.providers[0]?.id
    if (fallbackId) {
      const fallback = config.providers.find((p) => p.id === fallbackId)
      const model = fallback?.defaultModel ?? fallback?.models?.[0] ?? ''
      session.repos.canvasRepo.retargetProvider(providerId, fallbackId, model)
    }

    return config
  })

  handle(IPC.canvasCreate, (input) => session.createCanvas(input))
  handle(IPC.canvasList, () => session.listCanvases())
  handle(IPC.canvasGet, ({ id }: { id: string }): CanvasDetail => session.getCanvasDetail(id))
  handle(IPC.canvasUpdate, ({ id, providerId, model }: { id: string; providerId: string; model: string }) => {
    session.repos.canvasRepo.update(id, { providerId, model })
    return true
  })
  handle(IPC.canvasRename, ({ id, title }: { id: string; title: string }) => {
    session.repos.canvasRepo.update(id, { title })
    return true
  })
  handle(IPC.canvasDelete, ({ id }: { id: string }) => {
    const detail = session.getCanvasDetail(id)
    for (const node of detail.nodes) {
      if (node.parentId === null) session.deleteSubtree(node.id)
    }
    session.repos.canvasRepo.delete(id)
    return true
  })

  handle(IPC.nodeCreate, (input) => session.createNode(input))
  handle(IPC.nodeRename, ({ nodeId, title }: { nodeId: string; title: string }) => {
    session.renameNode(nodeId, title)
    return true
  })
  handle(IPC.turnAdd, (input) => session.addTurn(input))
  handle(IPC.turnAsk, (input) => session.askTurn(input))
  handle(IPC.turnGenerate, ({ turnId }: { turnId: string }) => session.generateTurn(turnId))
  handle(IPC.turnRegenerate, ({ turnId }: { turnId: string }) => session.regenerate(turnId))
  handle(IPC.turnDelete, ({ turnId }: { turnId: string }) => {
    session.deleteTurn(turnId)
    return true
  })
  handle(IPC.turnPromote, ({ turnId }: { turnId: string }) => session.promoteTurn(turnId))
  handle(IPC.turnMergeToParent, ({ turnId }: { turnId: string }) =>
    session.mergeTurnToParent(turnId)
  )
  handle(
    IPC.turnSetActiveMessage,
    ({ turnId, messageId }: { turnId: string; messageId: string }) => {
      session.setActiveMessage(turnId, messageId)
      return true
    }
  )
  handle(IPC.nodeCompact, async ({ nodeId }: { nodeId: string }) => {
    await session.compact(nodeId)
    return true
  })
  handle(IPC.nodeUncompact, ({ nodeId }: { nodeId: string }) => {
    session.uncompact(nodeId)
    return true
  })
  handle(IPC.nodeDelete, ({ nodeId }: { nodeId: string }) => {
    session.deleteSubtree(nodeId)
    return true
  })
  handle(IPC.nodeCollapse, ({ nodeId, collapsed }: { nodeId: string; collapsed: boolean }) => {
    session.setCollapsed(nodeId, collapsed)
    return true
  })
  handle(IPC.nodeMove, ({ nodeId, x, y }: { nodeId: string; x: number; y: number }) => {
    session.moveNode(nodeId, x, y)
    return true
  })

  handle(IPC.tokensCanvas, ({ canvasId }: { canvasId: string }): TokenSum => session.canvasTokens(canvasId))
  handle(IPC.tokensBranch, ({ nodeId }: { nodeId: string }): TokenSum => session.branchTokens(nodeId))
  handle(IPC.tokensNode, ({ nodeId }: { nodeId: string }): TokenSum => session.nodeTokens(nodeId))

  handle(IPC.generateCancel, ({ turnId }: { turnId: string }) => {
    session.cancelGeneration(turnId)
    return true
  })
}
