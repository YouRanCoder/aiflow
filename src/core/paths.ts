import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { APP_DIR_NAME } from '@shared/constants'

export function appDir(): string {
  return process.env.AIFLOW_HOME ?? join(homedir(), APP_DIR_NAME)
}

export function ensureAppDir(): string {
  const dir = appDir()
  mkdirSync(dir, { recursive: true })
  return dir
}

export function dbPath(): string {
  return join(appDir(), 'aiflow.db')
}

export function configPath(): string {
  return join(appDir(), 'config.json')
}

export function authPath(): string {
  return join(appDir(), 'auth.json')
}
