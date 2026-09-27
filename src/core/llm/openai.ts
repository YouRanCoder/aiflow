import { errorFromStatus, LLMError, normalizeError } from './errors'
import type { ChatRequest, ChatStreamEvents, ChatUsage } from './types'

const REQUEST_TIMEOUT_MS = 120_000
const MAX_ATTEMPTS = 3

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function listModels(baseURL: string, apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const url = `${normalizeBaseURL(baseURL)}/models`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal
    })
    if (!res.ok) {
      throw errorFromStatus(res.status, await res.text().catch(() => ''))
    }
    const json = (await res.json()) as { data?: Array<{ id?: string }> }
    const ids = (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
    return ids.sort()
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function testConnection(
  baseURL: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; models: number; error?: string }> {
  try {
    const models = await listModels(baseURL, apiKey, signal)
    return { ok: true, models: models.length }
  } catch (err) {
    const e = normalizeError(err)
    return { ok: false, models: 0, error: `${e.code}: ${e.message}` }
  }
}

interface RawUsage {
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  prompt_cache_hit_tokens?: number
}

function toUsage(raw: RawUsage | undefined): ChatUsage {
  return {
    promptTokens: raw?.prompt_tokens ?? 0,
    completionTokens: raw?.completion_tokens ?? 0,
    cachedTokens: raw?.prompt_tokens_details?.cached_tokens ?? raw?.prompt_cache_hit_tokens ?? 0
  }
}

/**
 * 流式对话。仅在「首个 token 之前」失败时重试；已开始输出则不再重试，避免重复内容。
 */
export async function chatStream(req: ChatRequest, events: ChatStreamEvents): Promise<ChatUsage> {
  const url = `${normalizeBaseURL(req.baseURL)}/chat/completions`
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true }
  }
  if (req.params?.temperature !== undefined) body.temperature = req.params.temperature
  if (req.params?.topP !== undefined) body.top_p = req.params.topP
  if (req.params?.maxTokens !== undefined) body.max_tokens = req.params.maxTokens

  let lastError: LLMError | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let emitted = false
    let usage: ChatUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }

    try {
      const timeoutController = new AbortController()
      const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS)
      const onAbort = (): void => timeoutController.abort()
      req.signal?.addEventListener('abort', onAbort)

      let res: Response
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${req.apiKey}`,
            Accept: 'text/event-stream'
          },
          body: JSON.stringify(body),
          signal: timeoutController.signal
        })
      } finally {
        req.signal?.removeEventListener('abort', onAbort)
      }

      if (!res.ok) {
        clearTimeout(timeout)
        throw errorFromStatus(res.status, await res.text().catch(() => ''))
      }
      if (!res.body) {
        clearTimeout(timeout)
        throw new LLMError('SERVER', '响应不含流式 body')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false

      while (!finished) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIndex: number
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)

          if (!line || line.startsWith(':')) continue
          if (!line.startsWith('data:')) continue

          const payload = line.slice(5).trim()
          if (payload === '[DONE]') {
            finished = true
            break
          }

          let parsed: {
            choices?: Array<{ delta?: { content?: string } }>
            usage?: RawUsage
          }
          try {
            parsed = JSON.parse(payload)
          } catch {
            continue
          }

          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            emitted = true
            events.onDelta(delta)
          }
          if (parsed.usage) {
            usage = toUsage(parsed.usage)
          }
        }
      }

      clearTimeout(timeout)
      req.signal?.throwIfAborted()
      events.onUsage(usage)
      return usage
    } catch (err) {
      const mapped = normalizeError(err)
      if (mapped.code === 'ABORTED') throw mapped

      lastError = mapped
      if (emitted || !mapped.retryable || attempt === MAX_ATTEMPTS) throw mapped

      const backoff = 500 * 2 ** (attempt - 1)
      await sleep(backoff)
    }
  }

  throw lastError ?? new LLMError('UNKNOWN', '未知错误')
}
