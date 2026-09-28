import { useEffect, useState } from 'react'
import type { KeyStatus } from '@shared/types/domain'
import type { ProviderConfig } from '@shared/types/config'
import { useAppStore } from '../store/useAppStore'

const EMPTY_PROVIDER: ProviderConfig = {
  id: '',
  name: '',
  baseURL: 'https://api.openai.com/v1',
  defaultModel: '',
  models: [],
  params: { temperature: 0.7 },
  contextWindow: 128000
}

/** 提示信息带语气：成功不再是绿色、报错不再是绿色，两者分开 */
type Notice = { text: string; tone: 'info' | 'ok' | 'error' }

/** 设置页左栏的两块：通用设置 / 某个 Provider 的配置 */
type SettingsView = 'provider' | 'global'

export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen)
  const setOpen = useAppStore((s) => s.setSettingsOpen)
  const config = useAppStore((s) => s.config)
  const saveConfig = useAppStore((s) => s.saveConfig)
  const loadConfig = useAppStore((s) => s.loadConfig)
  const loadCanvases = useAppStore((s) => s.loadCanvases)
  const refreshDetail = useAppStore((s) => s.refreshDetail)

  const [view, setView] = useState<SettingsView>('provider')
  const [globalPrompt, setGlobalPrompt] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderConfig | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [encAvailable, setEncAvailable] = useState(true)
  const [working, setWorking] = useState(false)

  // 只在「打开」时初始化一次：保存后 config 会变，依赖 config 会把表单打回默认项。
  useEffect(() => {
    if (!open) return
    const current = useAppStore.getState().config
    if (!current) return
    const id = current.defaultProviderId ?? current.providers[0]?.id ?? null
    const provider = current.providers.find((p) => p.id === id) ?? null
    setView('provider')
    setGlobalPrompt(current.systemPrompt ?? '')
    setEditingId(id)
    setForm(provider ? { ...provider } : { ...EMPTY_PROVIDER })
    setModels(provider?.models ?? [])
    setKeyInput('')
    setNotice(null)
    void window.api.secrets.available().then(setEncAvailable)
    loadKeyStatus(id)
  }, [open])

  if (!open || !config || !form) return null

  const isDefault = Boolean(editingId) && config.defaultProviderId === editingId
  const saved = editingId !== null

  const field =
    'w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-sm text-fg transition-colors placeholder:text-faint focus:border-accent-line disabled:opacity-60'

  const secondaryButton =
    'rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40'

  const primaryButton =
    'rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40'

  function navClass(active: boolean): string {
    return `flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
      active ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-panel hover:text-fg'
    }`
  }

  function fail(err: unknown): void {
    setNotice({ text: err instanceof Error ? err.message : String(err), tone: 'error' })
  }

  function loadKeyStatus(id: string | null): void {
    if (!id) {
      setKeyStatus(null)
      return
    }
    void window.api.secrets.status(id).then(setKeyStatus)
  }

  function applyProvider(provider: ProviderConfig | null): void {
    setEditingId(provider?.id ?? null)
    setConfirmDeleteId(null)
    setForm(provider ? { ...provider } : { ...EMPTY_PROVIDER })
    setModels(provider?.models ?? [])
    setKeyInput('')
    loadKeyStatus(provider?.id ?? null)
  }

  function selectProvider(id: string): void {
    const provider = config?.providers.find((p) => p.id === id)
    if (!provider) return
    setNotice(null)
    setView('provider')
    applyProvider(provider)
  }

  async function persistProvider(next: ProviderConfig): Promise<void> {
    const providers = config ? [...config.providers] : []
    const index = providers.findIndex((p) => p.id === next.id)
    if (index >= 0) providers[index] = next
    else providers.push(next)
    const patch = {
      providers,
      defaultProviderId: config?.defaultProviderId ?? next.id
    }
    await saveConfig(patch)
  }

  async function handleSaveGlobalPrompt(): Promise<void> {
    setWorking(true)
    try {
      await saveConfig({ systemPrompt: globalPrompt })
      setNotice({
        text: globalPrompt.trim()
          ? '全局提示词已保存，后续请求立即生效'
          : '全局提示词已清空，不再注入',
        tone: 'ok'
      })
    } catch (err) {
      fail(err)
    } finally {
      setWorking(false)
    }
  }

  async function handleSave(): Promise<void> {
    if (!form) return
    const next: ProviderConfig = {
      ...form,
      id: form.id.trim() || 'provider-' + Date.now(),
      name: form.name.trim() || form.id.trim() || '未命名 Provider',
      baseURL: form.baseURL.trim(),
      models
    }
    setWorking(true)
    try {
      await persistProvider(next)
      setEditingId(next.id)
      setForm(next)
      setNotice({ text: `已保存「${next.name}」`, tone: 'ok' })
    } catch (err) {
      fail(err)
    } finally {
      setWorking(false)
    }
  }

  async function handleSetDefault(): Promise<void> {
    if (!editingId) return
    setWorking(true)
    try {
      await saveConfig({ defaultProviderId: editingId })
      setNotice({
        text: `已将「${form?.name || editingId}」设为默认 Provider，新建画布会用它`,
        tone: 'ok'
      })
    } catch (err) {
      fail(err)
    } finally {
      setWorking(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!editingId) return
    const label = form?.name || editingId
    const affected = useAppStore.getState().canvases.filter((c) => c.providerId === editingId).length
    setWorking(true)
    try {
      await window.api.providers.delete(editingId)
      await loadConfig()
      // 画布可能已被后端改接到新的默认 Provider，刷新列表与当前画布详情
      await loadCanvases()
      await refreshDetail()

      const next = useAppStore.getState().config
      const remaining = next?.providers ?? []
      const nextId = next?.defaultProviderId ?? remaining[0]?.id ?? null
      const tail = affected > 0 ? `，${affected} 个画布已切换到其他 Provider` : ''
      applyProvider(remaining.find((p) => p.id === nextId) ?? null)
      setNotice({
        text:
          remaining.length > 0
            ? `已删除「${label}」${tail}`
            : `已删除「${label}」${tail}，请添加新的 Provider`,
        tone: 'ok'
      })
    } catch (err) {
      fail(err)
    } finally {
      setWorking(false)
    }
  }

  async function handleSaveKey(): Promise<void> {
    if (!editingId || !keyInput.trim()) return
    setWorking(true)
    try {
      const status = await window.api.secrets.set(editingId, keyInput.trim())
      setKeyStatus(status)
      setKeyInput('')
      setNotice({ text: '密钥已加密保存', tone: 'ok' })
    } catch (err) {
      fail(err)
    } finally {
      setWorking(false)
    }
  }

  async function handleRemoveKey(): Promise<void> {
    if (!editingId) return
    const status = await window.api.secrets.remove(editingId)
    setKeyStatus(status)
    setNotice({ text: '密钥已删除', tone: 'ok' })
  }

  async function handleTest(): Promise<void> {
    if (!editingId) return
    setWorking(true)
    setNotice({ text: '测试中…', tone: 'info' })
    try {
      const result = await window.api.providers.test(editingId)
      setNotice(
        result.ok
          ? { text: `连接成功，可用模型 ${result.models} 个`, tone: 'ok' }
          : { text: `连接失败：${result.error ?? '未知错误'}`, tone: 'error' }
      )
    } catch (err) {
      fail(err)
    } finally {
      setWorking(false)
    }
  }

  async function handleFetchModels(): Promise<void> {
    if (!editingId || !form) return
    setWorking(true)
    setNotice({ text: '拉取模型列表…', tone: 'info' })
    try {
      const list = await window.api.providers.listModels(editingId)
      setModels(list)
      if (!form.defaultModel && list.length > 0) setForm({ ...form, defaultModel: list[0] })
      setNotice({
        text:
          list.length > 0
            ? `获取到 ${list.length} 个模型，点模型可设为默认模型`
            : '接口没有返回任何模型',
        tone: list.length > 0 ? 'ok' : 'info'
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setNotice({
        text: `拉取失败：${message}。请确认已保存 API Key 且 Base URL 可访问。`,
        tone: 'error'
      })
    } finally {
      setWorking(false)
    }
  }

  const noticeClass =
    notice?.tone === 'error'
      ? 'text-danger-text'
      : notice?.tone === 'ok'
        ? 'text-ok-text'
        : 'text-muted'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex max-h-[86vh] w-[720px] flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-elevated"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="settings-title" className="text-sm font-medium text-fg">
            设置
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭"
            className="rounded px-1 text-lg leading-none text-faint transition-colors hover:text-fg"
          >
            ×
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <nav className="scroll-stable w-48 shrink-0 space-y-0.5 overflow-y-auto border-r border-line p-3">
            <div className="px-2 pb-1.5 text-2xs text-faint">通用</div>
            <button
              type="button"
              aria-current={view === 'global' ? 'true' : undefined}
              onClick={() => {
                setNotice(null)
                setView('global')
              }}
              className={navClass(view === 'global')}
            >
              <span className="flex-1 truncate">全局提示词</span>
            </button>

            <div className="px-2 pb-1.5 pt-3 text-2xs text-faint">Provider</div>
            {config.providers.map((provider) => (
              <button
                type="button"
                key={provider.id}
                aria-current={view === 'provider' && provider.id === editingId ? 'true' : undefined}
                onClick={() => selectProvider(provider.id)}
                className={navClass(view === 'provider' && provider.id === editingId)}
              >
                <span className="flex-1 truncate">{provider.name || provider.id}</span>
                {config.defaultProviderId === provider.id && (
                  <span className="shrink-0 text-2xs text-warn-text">默认</span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setNotice({ text: '新 Provider：填好 ID / 名称 / Base URL 后点「保存」', tone: 'info' })
                setView('provider')
                applyProvider(null)
              }}
              className="mt-1 block w-full rounded-md px-2 py-1.5 text-left text-xs text-accent-text transition-colors hover:bg-panel"
            >
              + 添加 Provider
            </button>
          </nav>

          <div className="scroll-stable flex-1 space-y-4 overflow-y-auto p-5">
            {view === 'global' ? (
              <>
                <div>
                  <div className="text-sm font-medium text-fg">全局提示词</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    这里写的内容会作为 <strong className="font-medium text-fg">system 消息</strong>{' '}
                    注入到所有画布的每一次请求，位置在角色说明之后、「当前画布」之前。适合长期有效的偏好，
                    例如「回答用中文，代码给最小可运行示例」。
                  </p>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs text-muted">提示词内容</span>
                  <textarea
                    className={`${field} h-56 resize-y leading-relaxed`}
                    value={globalPrompt}
                    onChange={(event) => setGlobalPrompt(event.target.value)}
                    placeholder="例如：回答用中文；涉及代码时先给结论再给最小示例；不确定的地方明确说明。"
                  />
                  <span className="block text-2xs text-faint">
                    {globalPrompt.trim()
                      ? `${globalPrompt.trim().length} 字，会计入每次请求的输入 token`
                      : '留空则不注入'}
                  </span>
                </label>

                <p className="rounded-md border border-line bg-panel px-3 py-2 text-2xs leading-relaxed text-muted">
                  提示词位于上下文最前面，改动它会让所有分支的提示缓存失效一次，之后的请求会重新建立缓存。
                </p>
              </>
            ) : (
              <>
                {config.providers.length === 0 && (
                  <div className="rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-xs leading-relaxed text-fg">
                    <div className="mb-1 text-sm font-medium text-fg">还没有配置 Provider</div>
                    <span className="text-muted">
                      填好下面的 Base URL 与 API Key，点右下角「保存」即可开始。若服务商兼容 /models
                      接口，保存密钥后可以点「拉取模型列表」自动获取可用模型。
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className="text-xs text-muted">ID</span>
                    <input
                      className={field}
                      value={form.id}
                      disabled={saved}
                      onChange={(e) => setForm({ ...form, id: e.target.value })}
                      placeholder="例如 xiaomi"
                    />
                    {saved && <span className="block text-2xs text-faint">ID 创建后不可修改</span>}
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs text-muted">名称</span>
                    <input
                      className={field}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="例如 小米 MiMo"
                    />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs text-muted">Base URL</span>
                  <input
                    className={field}
                    value={form.baseURL}
                    onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                  <span className="block text-2xs text-faint">需以 /v1 结尾（OpenAI 兼容接口）</span>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className="text-xs text-muted">默认模型</span>
                    <input
                      className={field}
                      value={form.defaultModel ?? ''}
                      onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
                      placeholder="例如 mimo-v2.6-pro"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs text-muted">上下文窗口（用于 70% 提示）</span>
                    <input
                      className={`${field} tnum`}
                      type="number"
                      value={form.contextWindow ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          contextWindow: e.target.value ? Number(e.target.value) : undefined
                        })
                      }
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">API Key</span>
                    <span className="tnum text-2xs text-faint">
                      {keyStatus?.hasKey ? `已保存 ${keyStatus.masked}` : '未保存'}
                    </span>
                  </div>
                  {!encAvailable && (
                    <p className="rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger-text">
                      当前系统不支持安全加密（safeStorage），无法保存密钥。
                    </p>
                  )}
                  {!saved && (
                    <p className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs text-muted">
                      先点「保存」创建 Provider，再填写 API Key。
                    </p>
                  )}
                  <div className="flex gap-2">
                    <input
                      className={field}
                      type="password"
                      aria-label="API Key"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="sk-..."
                      disabled={!encAvailable || !saved}
                    />
                    <button
                      type="button"
                      disabled={!encAvailable || !saved || !keyInput.trim() || working}
                      onClick={() => void handleSaveKey()}
                      className="shrink-0 rounded-md bg-accent px-3 text-xs text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
                    >
                      保存密钥
                    </button>
                    <button
                      type="button"
                      disabled={!saved || !keyStatus?.hasKey}
                      onClick={() => void handleRemoveKey()}
                      className={`shrink-0 ${secondaryButton}`}
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="tnum text-xs text-muted">模型列表（{models.length}）</span>
                    <button
                      type="button"
                      disabled={!saved || working}
                      onClick={() => void handleFetchModels()}
                      className="rounded-md border border-line bg-panel px-2.5 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
                    >
                      {working ? '拉取中…' : '拉取模型列表'}
                    </button>
                  </div>
                  <p className="text-2xs text-faint">
                    从该 Provider 的 /models 接口获取，需先保存 API Key。
                  </p>
                  <div className="scroll-stable flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-md border border-line p-2">
                    {models.length === 0 && <span className="text-xs text-faint">暂无</span>}
                    {models.map((model) => (
                      <button
                        type="button"
                        key={model}
                        aria-pressed={form.defaultModel === model}
                        onClick={() => setForm({ ...form, defaultModel: model })}
                        title="设为默认模型"
                        className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                          form.defaultModel === model
                            ? 'bg-accent-soft text-accent-text'
                            : 'text-muted hover:bg-panel hover:text-fg'
                        }`}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {notice && (
              <p
                role={notice.tone === 'error' ? 'alert' : 'status'}
                className={`text-xs ${noticeClass}`}
              >
                {notice.text}
              </p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          {view === 'global' ? (
            <>
              <span className="text-2xs text-faint">作用于所有画布</span>
              <button
                type="button"
                disabled={working}
                onClick={() => void handleSaveGlobalPrompt()}
                className={primaryButton}
              >
                保存
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {saved &&
                  (confirmDeleteId === editingId ? (
                    <>
                      <span className="text-xs text-danger-text">
                        确认删除「{form?.name || editingId}」？密钥会一并删除。
                      </span>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void handleDelete()}
                        className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110 disabled:opacity-40"
                      >
                        确认删除
                      </button>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => setConfirmDeleteId(null)}
                        className={secondaryButton}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => setConfirmDeleteId(editingId)}
                      className="rounded-md border border-danger/35 px-3 py-1.5 text-xs text-danger-text transition-colors hover:bg-danger-soft disabled:opacity-40"
                    >
                      删除 Provider
                    </button>
                  ))}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={!saved || working}
                  onClick={() => void handleTest()}
                  className={secondaryButton}
                >
                  测试连接
                </button>
                <button
                  type="button"
                  disabled={!saved || isDefault || working}
                  title={isDefault ? '已经是默认 Provider' : '新建画布时将使用这个 Provider'}
                  onClick={() => void handleSetDefault()}
                  className={secondaryButton}
                >
                  {isDefault ? '默认 Provider' : '设为默认'}
                </button>
                <button type="button" disabled={working} onClick={() => void handleSave()} className={primaryButton}>
                  保存
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
