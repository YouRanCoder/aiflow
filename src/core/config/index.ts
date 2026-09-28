import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { AppConfig, ProviderConfig } from '@shared/types/config'
import { AppConfigSchema } from '@shared/contract'
import { configPath, ensureAppDir } from '../paths'

export function defaultConfig(): AppConfig {
  return {
    version: 1,
    providers: [],
    systemPrompt: '',
    ui: { skin: 'tree', theme: 'system' },
    logging: { debug: false }
  }
}

let cached: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (cached) return cached

  ensureAppDir()
  const path = configPath()

  if (!existsSync(path)) {
    const fresh = defaultConfig()
    saveConfig(fresh)
    return fresh
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    const parsed = AppConfigSchema.parse(raw)
    cached = parsed as AppConfig
    return cached
  } catch {
    // 配置损坏：备份后回退默认，避免应用无法启动
    try {
      renameSync(path, `${path}.bak`)
    } catch {
      /* ignore */
    }
    const fresh = defaultConfig()
    saveConfig(fresh)
    return fresh
  }
}

export function saveConfig(config: AppConfig): void {
  ensureAppDir()
  const validated = AppConfigSchema.parse(config) as AppConfig
  writeFileSync(configPath(), JSON.stringify(validated, null, 2), 'utf-8')
  cached = validated
}

export function patchConfig(patch: Partial<AppConfig>): AppConfig {
  const next: AppConfig = { ...loadConfig(), ...patch }
  saveConfig(next)
  return next
}

export function getProvider(providerId: string): ProviderConfig | undefined {
  return loadConfig().providers.find((p) => p.id === providerId)
}

/** 删除 provider；若删掉的正是默认项，则回落到剩余第一个（可能为空）。 */
export function removeProvider(providerId: string): AppConfig {
  const config = loadConfig()
  const providers = config.providers.filter((p) => p.id !== providerId)
  const defaultProviderId =
    config.defaultProviderId === providerId ? providers[0]?.id : config.defaultProviderId
  return patchConfig({ providers, defaultProviderId })
}

export function resolveProvider(providerId?: string): ProviderConfig | undefined {
  const config = loadConfig()
  const id = providerId ?? config.defaultProviderId ?? config.providers[0]?.id
  if (!id) return undefined
  return config.providers.find((p) => p.id === id)
}

/** 仅供测试使用：清空内存缓存 */
export function resetConfigCache(): void {
  cached = null
}
