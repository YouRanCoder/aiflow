export type LLMErrorCode =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'BAD_REQUEST'
  | 'SERVER'
  | 'ABORTED'
  | 'UNKNOWN'

export class LLMError extends Error {
  readonly code: LLMErrorCode
  readonly status?: number
  readonly retryable: boolean

  constructor(code: LLMErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'LLMError'
    this.code = code
    this.status = status
    this.retryable = code === 'RATE_LIMIT' || code === 'TIMEOUT' || code === 'NETWORK' || code === 'SERVER'
  }
}

export function errorFromStatus(status: number, body: string): LLMError {
  const detail = body ? `: ${body.slice(0, 300)}` : ''
  if (status === 401 || status === 403) return new LLMError('AUTH', `认证失败（${status}）${detail}`, status)
  if (status === 429) return new LLMError('RATE_LIMIT', `请求过于频繁（429）${detail}`, status)
  if (status >= 500) return new LLMError('SERVER', `服务端错误（${status}）${detail}`, status)
  if (status === 408 || status === 504) return new LLMError('TIMEOUT', `请求超时（${status}）${detail}`, status)
  return new LLMError('BAD_REQUEST', `请求被拒绝（${status}）${detail}`, status)
}

export function normalizeError(err: unknown): LLMError {
  if (err instanceof LLMError) return err
  const name = (err as { name?: string } | null)?.name
  if (name === 'AbortError') return new LLMError('ABORTED', '请求已取消')
  const message = err instanceof Error ? err.message : String(err)
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) {
    return new LLMError('NETWORK', `网络错误: ${message}`)
  }
  return new LLMError('UNKNOWN', message)
}
