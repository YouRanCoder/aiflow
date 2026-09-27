import { randomUUID } from 'node:crypto'
import type {
  Anchor,
  Canvas,
  CanvasDetail,
  Message,
  Node,
  NodeWithTurns,
  Quote,
  TokenSum,
  Turn
} from '@shared/types/domain'
import type { SamplingParams } from '@shared/types/config'
import type { StreamChunkEvent, StreamDoneEvent, StreamErrorEvent } from '@shared/contract'
import { getProvider } from '@core/config'
import type { Db } from '@core/db'
import { createCanvasRepo, type CanvasRepo } from '@core/db/repos/canvas'
import { createMessageRepo, type MessageRepo } from '@core/db/repos/message'
import { createNodeRepo, type NodeRepo } from '@core/db/repos/node'
import { createTurnRepo, type TurnRepo } from '@core/db/repos/turn'
import { buildContext, type ContextSource } from '@core/context/build'
import { renderQuestion, renderTopic } from '@core/context/render'
import { chatStream } from '@core/llm/openai'
import { normalizeError } from '@core/llm/errors'
import type { ChatMessage } from '@core/llm/types'
import {
  branchTokensOf,
  canvasTokensOf,
  nodeTokensOf,
  type TokenLookup
} from '@core/token/aggregate'

export interface ProviderRuntime {
  baseURL: string
  apiKey: string
  params?: SamplingParams
  contextWindow?: number
}

export interface StreamSink {
  chunk: (event: StreamChunkEvent) => void
  done: (event: StreamDoneEvent) => void
  error: (event: StreamErrorEvent) => void
}

export interface SessionDeps {
  db: Db
  sink: StreamSink
  credentials: (providerId: string) => ProviderRuntime | undefined
}

export interface NodeResult {
  nodeId: string
}

export interface TurnResult {
  turnId: string
  messageId: string
}

export interface CreateNodePayload {
  canvasId: string
  parentId: string | null
  title: string
  quote?: Quote | null
  anchor?: Anchor | null
}

export interface AddTurnPayload {
  nodeId: string
  question: string
}

export function createSession(deps: SessionDeps) {
  const canvasRepo: CanvasRepo = createCanvasRepo(deps.db)
  const nodeRepo: NodeRepo = createNodeRepo(deps.db)
  const turnRepo: TurnRepo = createTurnRepo(deps.db)
  const messageRepo: MessageRepo = createMessageRepo(deps.db)

  /** 同一轮同时只允许一个生成任务 */
  const controllers = new Map<string, AbortController>()

  const contextSource: ContextSource = {
    getNode: (id) => nodeRepo.get(id),
    ancestors: (id) => nodeRepo.ancestors(id),
    getTurn: (id) => turnRepo.get(id),
    turnsByNode: (id) => turnRepo.byNode(id),
    getActiveByTurn: (id) => messageRepo.getActiveByTurn(id),
    getCanvas: (id) => canvasRepo.get(id)
  }

  const tokenLookup: TokenLookup = {
    get: (id) => nodeRepo.get(id),
    ancestors: (id) => nodeRepo.ancestors(id),
    byCanvas: (id) => nodeRepo.byCanvas(id),
    activeMessagesOfNode: (nodeId) =>
      turnRepo.byNode(nodeId).flatMap((turn) => {
        const active = messageRepo.getActiveByTurn(turn.id)
        return active ? [active] : []
      })
  }

  function requireNode(nodeId: string): Node {
    const node = nodeRepo.get(nodeId)
    if (!node) throw new Error(`节点不存在: ${nodeId}`)
    return node
  }

  function requireTurn(turnId: string): Turn {
    const turn = turnRepo.get(turnId)
    if (!turn) throw new Error(`轮次不存在: ${turnId}`)
    return turn
  }

  /** 只建话题节点，不创建轮次、不调用模型。parentId 为 null 时同时设为画布根节点。 */
  function createNodeOnly(input: CreateNodePayload): Node {
    const canvas = canvasRepo.get(input.canvasId)
    if (!canvas) throw new Error(`画布不存在: ${input.canvasId}`)

    const node = nodeRepo.create({
      canvasId: input.canvasId,
      parentId: input.parentId,
      title: input.title,
      anchor: input.anchor ?? null,
      quote: input.quote ?? null
    })

    if (input.parentId === null) {
      canvasRepo.update(canvas.id, { rootNodeId: node.id })
    }
    canvasRepo.touch(canvas.id)

    return node
  }

  /** 为一轮新建 assistant 消息并在后台流式生成 */
  function startGeneration(turnId: string): TurnResult {
    const turn = requireTurn(turnId)
    const node = requireNode(turn.nodeId)
    const canvas = canvasRepo.get(node.canvasId)
    if (!canvas) throw new Error(`画布不存在: ${node.canvasId}`)

    const message = messageRepo.add({
      turnId: turn.id,
      nodeId: node.id,
      role: 'assistant',
      content: '',
      isActive: true,
      providerId: canvas.providerId,
      model: canvas.model
    })
    messageRepo.setActive(turn.id, message.id)

    void generate(turn.id, message.id)
    return { turnId: turn.id, messageId: message.id }
  }

  async function generate(turnId: string, messageId: string): Promise<void> {
    const turn = requireTurn(turnId)
    const node = requireNode(turn.nodeId)
    const canvas = canvasRepo.get(node.canvasId)
    if (!canvas) throw new Error(`画布不存在: ${node.canvasId}`)

    const runtime = deps.credentials(canvas.providerId)
    if (!runtime) {
      const message = getProvider(canvas.providerId)
        ? `未配置 Provider「${canvas.providerId}」的 API Key，请前往设置页配置`
        : `未找到 Provider「${canvas.providerId}」，请到设置页添加，或在顶栏为这个画布选择其他 Provider`
      messageRepo.fail(messageId, message)
      deps.sink.error({ turnId, nodeId: node.id, messageId, code: 'NO_CREDENTIALS', message })
      return
    }

    const controller = new AbortController()
    controllers.set(turnId, controller)

    try {
      const context = buildContext(turnId, contextSource)
      const usage = await chatStream(
        {
          baseURL: runtime.baseURL,
          apiKey: runtime.apiKey,
          model: canvas.model,
          messages: context.messages,
          params: { ...runtime.params, ...(canvas.params as SamplingParams | null) },
          signal: controller.signal
        },
        {
          onDelta: (delta) => {
            messageRepo.appendContent(messageId, delta)
            deps.sink.chunk({ turnId, nodeId: node.id, messageId, delta })
          },
          onUsage: () => {}
        }
      )

      messageRepo.finish(messageId, {
        usagePrompt: usage.promptTokens,
        usageCompletion: usage.completionTokens,
        usageCached: usage.cachedTokens
      })
      canvasRepo.touch(canvas.id)
      deps.sink.done({ turnId, nodeId: node.id, messageId })
    } catch (err) {
      const mapped = normalizeError(err)
      if (mapped.code !== 'ABORTED') {
        messageRepo.fail(messageId, `${mapped.code}: ${mapped.message}`)
        deps.sink.error({
          turnId,
          nodeId: node.id,
          messageId,
          code: mapped.code,
          message: mapped.message
        })
      }
    } finally {
      controllers.delete(turnId)
    }
  }

  return {
    repos: { canvasRepo, nodeRepo, turnRepo, messageRepo },

    createCanvas(input: {
      title: string
      description?: string | null
      providerId: string
      model: string
      params?: Record<string, unknown> | null
    }): Canvas {
      return canvasRepo.create(input)
    },

    listCanvases(): Canvas[] {
      return canvasRepo.list()
    },

    getCanvasDetail(canvasId: string): CanvasDetail {
      const canvas = canvasRepo.get(canvasId)
      if (!canvas) throw new Error(`画布不存在: ${canvasId}`)

      const nodes: NodeWithTurns[] = nodeRepo.byCanvas(canvasId).map((node) => ({
        ...node,
        turns: turnRepo.byNode(node.id).map((turn) => ({
          ...turn,
          messages: messageRepo.listByTurn(turn.id)
        }))
      }))

      return { canvas, nodes, tokens: canvasTokensOf(canvasId, tokenLookup) }
    },

    canvasTokens(canvasId: string): TokenSum {
      return canvasTokensOf(canvasId, tokenLookup)
    },

    branchTokens(nodeId: string): TokenSum {
      return branchTokensOf(nodeId, tokenLookup)
    },

    nodeTokens(nodeId: string): TokenSum {
      return nodeTokensOf(nodeId, tokenLookup)
    },

    /** 只建话题节点，不生成 */
    createNode(input: CreateNodePayload): NodeResult {
      return { nodeId: createNodeOnly(input).id }
    },

    renameNode(nodeId: string, title: string): void {
      requireNode(nodeId)
      nodeRepo.update(nodeId, { title })
    },

    /** 只加一轮提问，不生成 */
    addTurn(input: AddTurnPayload): { turnId: string } {
      requireNode(input.nodeId)
      const turn = turnRepo.create({ nodeId: input.nodeId, question: input.question })
      nodeRepo.touch(input.nodeId)
      return { turnId: turn.id }
    },

    /** 为已有轮次生成回答（该轮还没有回答时即为首个回答） */
    generateTurn(turnId: string): TurnResult {
      return startGeneration(turnId)
    },

    /** 重新生成：新增一个回答版本并设为当前版本 */
    regenerate(turnId: string): TurnResult {
      return startGeneration(turnId)
    },

    /** 加一轮提问并立即生成 */
    askTurn(input: AddTurnPayload): TurnResult {
      const turn = turnRepo.create({ nodeId: input.nodeId, question: input.question })
      return startGeneration(turn.id)
    },

    setActiveMessage(turnId: string, messageId: string): void {
      requireTurn(turnId)
      messageRepo.setActive(turnId, messageId)
    },

    deleteTurn(turnId: string): void {
      const turn = requireTurn(turnId)
      messageRepo.deleteByTurn(turn.id)
      turnRepo.delete(turn.id)
      turnRepo.reindex(turn.nodeId)
      nodeRepo.touch(turn.nodeId)
    },

    /**
     * 把某一轮问答提升为当前话题的子话题：那一轮连同回答一起移过去，不调用模型。
     * 适合「这个追问值得单独成为一个分支」的场景。
     */
    promoteTurn(turnId: string): NodeResult {
      const turn = requireTurn(turnId)
      const parent = requireNode(turn.nodeId)
      const canvas = canvasRepo.get(parent.canvasId)
      if (!canvas) throw new Error(`画布不存在: ${parent.canvasId}`)

      const title = turn.question.length > 60 ? `${turn.question.slice(0, 60)}…` : turn.question
      const child = nodeRepo.create({
        canvasId: parent.canvasId,
        parentId: parent.id,
        title
      })

      turnRepo.move(turn.id, child.id)
      // 冗余列必须跟着改，否则删子树/按话题查询会漏
      messageRepo.reassignNode(turn.id, child.id)
      turnRepo.reindex(parent.id)
      canvasRepo.touch(canvas.id)

      return { nodeId: child.id }
    },

    async compact(nodeId: string): Promise<void> {
      const node = requireNode(nodeId)
      if (!node.parentId) throw new Error('根话题没有可压缩的祖先')

      const canvas = canvasRepo.get(node.canvasId)
      if (!canvas) throw new Error(`画布不存在: ${node.canvasId}`)
      const runtime = deps.credentials(canvas.providerId)
      if (!runtime) throw new Error('未配置该 Provider 的 API Key')

      const chain = nodeRepo.ancestors(nodeId)
      const lines: string[] = []
      for (const ancestor of chain) {
        lines.push(renderTopic(ancestor, { includeAnchor: true }))
        for (const turn of turnRepo.byNode(ancestor.id)) {
          const answer = messageRepo.getActiveByTurn(turn.id)
          lines.push(renderQuestion(turn))
          lines.push(answer?.content ? answer.content : '（无回答）')
        }
      }

      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            '你是对话压缩器。把给定的历史话题与问答压缩成简洁摘要，保留关键结论、定义与未决问题，省略寒暄和重复，使用要点列表输出。'
        },
        { role: 'user', content: lines.join('\n\n') }
      ]

      let summary = ''
      await chatStream(
        {
          baseURL: runtime.baseURL,
          apiKey: runtime.apiKey,
          model: canvas.model,
          messages,
          params: runtime.params
        },
        {
          onDelta: (delta) => {
            summary += delta
          },
          onUsage: () => {}
        }
      )

      nodeRepo.update(nodeId, { summary, summaryCoversNodeId: node.parentId })
      canvasRepo.touch(canvas.id)
    },

    uncompact(nodeId: string): void {
      requireNode(nodeId)
      nodeRepo.update(nodeId, { summary: null, summaryCoversNodeId: null })
    },

    deleteSubtree(nodeId: string): void {
      const node = requireNode(nodeId)
      const canvas = canvasRepo.get(node.canvasId)
      if (canvas && canvas.rootNodeId === nodeId) {
        canvasRepo.update(canvas.id, { rootNodeId: null })
      }
      nodeRepo.deleteSubtree(nodeId)
      if (canvas) canvasRepo.touch(canvas.id)
    },

    setCollapsed(nodeId: string, collapsed: boolean): void {
      requireNode(nodeId)
      nodeRepo.update(nodeId, { collapsed })
    },

    moveNode(nodeId: string, x: number, y: number): void {
      requireNode(nodeId)
      nodeRepo.update(nodeId, { posX: x, posY: y })
    },

    cancelGeneration(turnId: string): void {
      controllers.get(turnId)?.abort()
    },

    /** 供测试与清理使用 */
    messagesByTurn(turnId: string): Message[] {
      return messageRepo.listByTurn(turnId)
    },

    turnsByNode(nodeId: string): Turn[] {
      return turnRepo.byNode(nodeId)
    },

    newId(): string {
      return randomUUID()
    }
  }
}

export type Session = ReturnType<typeof createSession>
