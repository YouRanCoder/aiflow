import type { Message, Node, TokenSum } from '@shared/types/domain'

/** 汇总 token 只需要两件事：树的形状，以及每个话题当前生效的回答 */
export interface TokenLookup {
  get(id: string): Node | undefined
  ancestors(nodeId: string): Node[]
  byCanvas(canvasId: string): Node[]
  /** 某话题下所有轮次的当前生效回答 */
  activeMessagesOfNode(nodeId: string): Message[]
}

export function emptyTokenSum(): TokenSum {
  return { prompt: 0, completion: 0, cached: 0, total: 0 }
}

export function sumUsage(messages: Message[]): TokenSum {
  const sum = emptyTokenSum()
  for (const message of messages) {
    sum.prompt += message.usagePrompt
    sum.completion += message.usageCompletion
    sum.cached += message.usageCached
  }
  sum.total = sum.prompt + sum.completion
  return sum
}

/** 一个话题的 token = 它自己全部轮次之和（不含祖先） */
export function nodeTokensOf(nodeId: string, lookup: TokenLookup): TokenSum {
  return sumUsage(lookup.activeMessagesOfNode(nodeId))
}

/** 分支总 token = 根 → 该话题路径上所有话题的全部轮次之和 */
export function branchTokensOf(nodeId: string, lookup: TokenLookup): TokenSum {
  const self = lookup.get(nodeId)
  if (!self) return emptyTokenSum()
  const path = [...lookup.ancestors(nodeId), self]
  return sumUsage(path.flatMap((node) => lookup.activeMessagesOfNode(node.id)))
}

/** 画布总 token = 画布内所有话题的全部轮次之和 */
export function canvasTokensOf(canvasId: string, lookup: TokenLookup): TokenSum {
  return sumUsage(lookup.byCanvas(canvasId).flatMap((node) => lookup.activeMessagesOfNode(node.id)))
}
