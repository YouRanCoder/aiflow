import { encode } from 'gpt-tokenizer'
import type { ChatMessage } from '../llm/types'

const PER_MESSAGE_OVERHEAD = 4
const REPLY_PRIMING = 2

export function countText(text: string): number {
  if (!text) return 0
  try {
    return encode(text).length
  } catch {
    return Math.ceil(text.length / 4)
  }
}

export function estimateTokens(messages: ChatMessage[]): number {
  let total = 0
  for (const message of messages) {
    total += countText(message.content) + PER_MESSAGE_OVERHEAD
  }
  return total + REPLY_PRIMING
}
