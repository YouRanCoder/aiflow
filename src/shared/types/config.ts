import type { Skin } from './domain'

export interface SamplingParams {
  temperature?: number
  topP?: number
  maxTokens?: number
}

export interface ProviderConfig {
  id: string
  name: string
  baseURL: string
  defaultModel?: string
  models?: string[]
  params?: SamplingParams
  contextWindow?: number
}

export interface UiConfig {
  skin: Skin
  theme: 'system' | 'light' | 'dark'
  /** 面板布局；缺省时用内置默认值 */
  sidebarWidth?: number
  detailWidth?: number
  sidebarCollapsed?: boolean
  detailCollapsed?: boolean
}

export interface AppConfig {
  version: number
  providers: ProviderConfig[]
  defaultProviderId?: string
  /** 全局提示词：每次请求都会拼进 system 消息，作用于所有画布 */
  systemPrompt?: string
  ui: UiConfig
  logging?: { debug?: boolean }
}

export interface AuthFile {
  version: number
  keys: Record<string, { cipher: string; updatedAt: number }>
}
