import type { Canvas, Message, Node, Turn } from '@shared/types/domain'
import type { ChatMessage } from '../llm/types'
import { estimateTokens } from '../token/estimate'
import { renderAnchor, renderQuestion, renderTopic } from './render'

export const SYSTEM_PROMPT = [
  '你是 Aiflow 的学习助手，帮助用户理解代码与技术概念。',
  '回答要准确、聚焦用户当前的问题；必要时给出简短示例。',
  '用户的学习被组织成一棵话题树：每个节点是一个话题，话题内可以有连续多轮问答。',
  '你收到的历史是「当前分支」的祖先话题与当前话题已有的问答；其它分支的内容不会出现。',
  '若上下文中出现「[压缩后的历史摘要]」，它是更早对话的压缩结果，请视为已发生的历史。'
].join('\n')

export interface ContextSource {
  getNode(id: string): Node | undefined
  ancestors(nodeId: string): Node[]
  getTurn(id: string): Turn | undefined
  turnsByNode(nodeId: string): Turn[]
  getActiveByTurn(turnId: string): Message | undefined
  getCanvas(id: string): Canvas | undefined
}

export interface BuildResult {
  messages: ChatMessage[]
  estimatedTokens: number
  usedCompactAt?: string
}

function canvasHeader(canvas: Canvas | undefined): string {
  if (!canvas) return SYSTEM_PROMPT
  return `${SYSTEM_PROMPT}\n\n当前画布：${canvas.title}`
}

/** 把一个祖先话题（标题 + 它全部已生成的问答）追加进上下文 */
function appendTopic(
  messages: ChatMessage[],
  node: Node,
  source: ContextSource,
  options: { includeAnchor?: boolean } = {}
): void {
  const turns = source.turnsByNode(node.id)
  if (turns.length === 0) return

  const qa: ChatMessage[] = []
  for (const turn of turns) {
    const answer = source.getActiveByTurn(turn.id)
    if (!answer || answer.error || !answer.content) continue
    qa.push({ role: 'user', content: renderQuestion(turn) })
    qa.push({ role: 'assistant', content: answer.content })
  }
  if (qa.length === 0) return

  messages.push({ role: 'user', content: renderTopic(node, options) })
  messages.push(...qa)
}

/**
 * 组装某一轮的上下文。
 * 顺序固定：system → 根锚点 → (压缩摘要) → 祖先话题链 → 当前话题已有问答 → 本轮问题，
 * 以最大化前缀缓存命中；同级分支的内容不会出现。
 */
export function buildContext(turnId: string, source: ContextSource): BuildResult {
  const target = source.getTurn(turnId)
  if (!target) throw new Error(`轮次不存在: ${turnId}`)
  const targetNode = source.getNode(target.nodeId)
  if (!targetNode) throw new Error(`节点不存在: ${target.nodeId}`)

  const canvas = source.getCanvas(targetNode.canvasId)
  const chain = source.ancestors(targetNode.id)

  const rootNode = chain[0] ?? targetNode
  const messages: ChatMessage[] = [{ role: 'system', content: canvasHeader(canvas) }]

  if (rootNode.anchor) {
    messages.push({ role: 'user', content: renderAnchor(rootNode.anchor) })
  }

  const candidates = [...chain, targetNode]
  let compactNode: Node | null = null
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i]
    if (candidate.summary && candidate.summaryCoversNodeId) {
      compactNode = candidate
      break
    }
  }

  let usedCompactAt: string | undefined
  let expandFrom = 0

  if (compactNode && compactNode.summaryCoversNodeId) {
    const cutIndex = chain.findIndex((n) => n.id === compactNode?.summaryCoversNodeId)
    if (cutIndex >= 0) {
      usedCompactAt = compactNode.id
      messages.push({ role: 'system', content: `[压缩后的历史摘要]\n${compactNode.summary ?? ''}` })
      expandFrom = cutIndex + 1
    }
  }

  for (let i = expandFrom; i < chain.length; i++) {
    const ancestor = chain[i]
    appendTopic(messages, ancestor, source, { includeAnchor: ancestor.id !== rootNode.id })
  }

  // 当前话题：话题块 + 本轮之前的问答 + 本轮问题
  const allTurns = source.turnsByNode(targetNode.id)
  const targetIndex = allTurns.findIndex((turn) => turn.id === target.id)
  const priorTurns = targetIndex >= 0 ? allTurns.slice(0, targetIndex) : []

  messages.push({
    role: 'user',
    content: renderTopic(targetNode, { includeAnchor: targetNode.id !== rootNode.id })
  })

  for (const turn of priorTurns) {
    const answer = source.getActiveByTurn(turn.id)
    if (!answer || answer.error || !answer.content) continue
    messages.push({ role: 'user', content: renderQuestion(turn) })
    messages.push({ role: 'assistant', content: answer.content })
  }

  messages.push({ role: 'user', content: renderQuestion(target) })

  return { messages, estimatedTokens: estimateTokens(messages), usedCompactAt }
}
