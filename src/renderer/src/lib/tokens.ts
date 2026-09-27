import type { NodeWithTurns, TokenSum } from '@shared/types/domain'

const EMPTY: TokenSum = { prompt: 0, completion: 0, cached: 0, total: 0 }

/** 一个话题的成本 = 它全部轮次当前生效回答之和 */
function nodeCost(node: NodeWithTurns): TokenSum {
  let prompt = 0
  let completion = 0
  let cached = 0
  for (const turn of node.turns) {
    const active = turn.messages.find((message) => message.isActive)
    if (!active) continue
    prompt += active.usagePrompt
    completion += active.usageCompletion
    cached += active.usageCached
  }
  return { prompt, completion, cached, total: prompt + completion }
}

export interface BranchInfo {
  tokens: TokenSum
  isLeaf: boolean
  childCount: number
}

/** 计算每个话题的分支总 token（根 → 该话题路径上所有话题的全部轮次之和） */
export function computeBranchInfo(nodes: NodeWithTurns[]): Map<string, BranchInfo> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const childCount = new Map<string | null, number>()
  for (const node of nodes) {
    childCount.set(node.parentId, (childCount.get(node.parentId) ?? 0) + 1)
  }

  const cache = new Map<string, TokenSum>()

  function walk(nodeId: string): TokenSum {
    const cached = cache.get(nodeId)
    if (cached) return cached
    const node = byId.get(nodeId)
    if (!node) return EMPTY
    const parentSum = node.parentId ? walk(node.parentId) : EMPTY
    const cost = nodeCost(node)
    const sum: TokenSum = {
      prompt: parentSum.prompt + cost.prompt,
      completion: parentSum.completion + cost.completion,
      cached: parentSum.cached + cost.cached,
      total: parentSum.total + cost.total
    }
    cache.set(nodeId, sum)
    return sum
  }

  const result = new Map<string, BranchInfo>()
  for (const node of nodes) {
    const count = childCount.get(node.id) ?? 0
    result.set(node.id, { tokens: walk(node.id), isLeaf: count === 0, childCount: count })
  }
  return result
}
