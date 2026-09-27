import { resolveProvider } from '@core/config'
import { getKey } from '@core/secrets'
import type { ProviderRuntime } from './session'

/** 组合 config 中的 Provider 配置与 secrets 中的密钥，供 main 进程内部使用 */
export function resolveCredentials(providerId: string): ProviderRuntime | undefined {
  const provider = resolveProvider(providerId)
  if (!provider) return undefined
  const apiKey = getKey(provider.id)
  if (!apiKey) return undefined
  return {
    baseURL: provider.baseURL,
    apiKey,
    params: provider.params,
    contextWindow: provider.contextWindow
  }
}
