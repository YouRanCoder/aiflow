import type { Message, NodeWithTurns, TurnWithMessages } from '@shared/types/domain'

/** 当前生效的回答：优先 `isActive`，没有标记时退回最后一条 */
export function activeMessage(turn: TurnWithMessages): Message | null {
  return (
    turn.messages.find((message) => message.isActive) ??
    turn.messages[turn.messages.length - 1] ??
    null
  )
}

/**
 * 话题是否处于失败状态 —— 只看当前生效的那一条回答。
 * v1 失败、v2 成功之后不应该再显示失败。
 */
export function nodeFailed(node: NodeWithTurns): boolean {
  return node.turns.some((turn) => Boolean(activeMessage(turn)?.error))
}
