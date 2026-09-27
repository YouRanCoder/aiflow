import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { safeStorage } from 'electron'
import type { AuthFile } from '@shared/types/config'
import type { KeyStatus } from '@shared/types/domain'
import { authPath, ensureAppDir } from '../paths'

function emptyAuth(): AuthFile {
  return { version: 1, keys: {} }
}

function readAuth(): AuthFile {
  ensureAppDir()
  const path = authPath()
  if (!existsSync(path)) return emptyAuth()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as AuthFile
    if (!parsed || typeof parsed !== 'object' || typeof parsed.keys !== 'object') return emptyAuth()
    return { version: parsed.version ?? 1, keys: parsed.keys ?? {} }
  } catch {
    return emptyAuth()
  }
}

function writeAuth(auth: AuthFile): void {
  ensureAppDir()
  writeFileSync(authPath(), JSON.stringify(auth, null, 2), 'utf-8')
}

export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function setKey(providerId: string, key: string): void {
  if (!isEncryptionAvailable()) {
    throw new Error('系统加密不可用（safeStorage），无法安全保存 API Key')
  }
  const cipher = safeStorage.encryptString(key).toString('base64')
  const auth = readAuth()
  auth.keys[providerId] = { cipher, updatedAt: Date.now() }
  writeAuth(auth)
}

/** 仅供 main 进程内部使用，绝不可经 IPC 返回给 renderer */
export function getKey(providerId: string): string | undefined {
  const entry = readAuth().keys[providerId]
  if (!entry) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(entry.cipher, 'base64'))
  } catch {
    return undefined
  }
}

export function deleteKey(providerId: string): void {
  const auth = readAuth()
  if (auth.keys[providerId]) {
    delete auth.keys[providerId]
    writeAuth(auth)
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 3)}…${key.slice(-4)}`
}

export function getKeyStatus(providerId: string): KeyStatus {
  const key = getKey(providerId)
  if (!key) return { providerId, hasKey: false }
  return { providerId, hasKey: true, masked: maskKey(key) }
}
