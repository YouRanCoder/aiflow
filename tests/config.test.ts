import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProviderConfig } from '@shared/types/config'
import {
  getProvider,
  loadConfig,
  patchConfig,
  removeProvider,
  resetConfigCache,
  resolveProvider
} from '@core/config'
import { configPath } from '@core/paths'

function provider(id: string): ProviderConfig {
  return {
    id,
    name: `名字-${id}`,
    baseURL: `https://${id}.example.com/v1`,
    defaultModel: `${id}-model`,
    models: [`${id}-model`],
    params: { temperature: 0.7 },
    contextWindow: 128000
  }
}

function readConfigFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(configPath(), 'utf-8')) as Record<string, unknown>
}

describe('配置层', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'aiflow-config-'))
    process.env.AIFLOW_HOME = home
    resetConfigCache()
  })

  afterEach(() => {
    resetConfigCache()
    delete process.env.AIFLOW_HOME
    rmSync(home, { recursive: true, force: true })
  })

  it('全新安装不内置任何示例 Provider', () => {
    const config = loadConfig()
    expect(config.providers).toEqual([])
    expect(config.defaultProviderId).toBeUndefined()
    expect(resolveProvider()).toBeUndefined()
    expect(readConfigFile().providers).toEqual([])
  })

  it('新增 Provider 后可解析，默认项与显式查找都生效', () => {
    patchConfig({ providers: [provider('xiaomi')], defaultProviderId: 'xiaomi' })

    expect(resolveProvider()?.id).toBe('xiaomi')
    expect(resolveProvider('xiaomi')?.defaultModel).toBe('xiaomi-model')
    expect(getProvider('missing')).toBeUndefined()
    expect(resolveProvider('missing')).toBeUndefined()
  })

  it('removeProvider：删非默认项不动默认，删默认项回落到第一个，删空后无默认', () => {
    patchConfig({
      providers: [provider('a'), provider('b'), provider('c')],
      defaultProviderId: 'b'
    })

    removeProvider('a')
    expect(loadConfig().providers.map((p) => p.id)).toEqual(['b', 'c'])
    expect(loadConfig().defaultProviderId).toBe('b')

    removeProvider('b')
    expect(loadConfig().defaultProviderId).toBe('c')

    removeProvider('c')
    const empty = loadConfig()
    expect(empty.providers).toEqual([])
    expect(empty.defaultProviderId).toBeUndefined()

    const onDisk = readConfigFile()
    expect(onDisk.providers).toEqual([])
    expect('defaultProviderId' in onDisk).toBe(false)
  })
})
