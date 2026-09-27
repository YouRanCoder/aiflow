import type { SamplingParams } from '@shared/types/config'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  cachedTokens: number
}

export interface ChatStreamEvents {
  onDelta: (text: string) => void
  onUsage: (usage: ChatUsage) => void
}

export interface ChatRequest {
  baseURL: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  params?: SamplingParams
  signal?: AbortSignal
}

export interface ProviderCredentials {
  baseURL: string
  apiKey: string
}
