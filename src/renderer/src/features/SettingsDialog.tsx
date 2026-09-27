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

export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen)
  const setOpen = useAppStore((s) => s.setSettingsOpen)
  const config = useAppStore((s) => s.config)
  const saveConfig = useAppStore((s) => s.saveConfig)
  const loadConfig = useAppStore((s) => s.loadConfig)
  const loadCanvases = useAppStore((s) => s.loadCanvases)
  const refreshDetail = useAppStore((s) => s.refreshDetail)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderConfig | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [encAvailable, setEncAvailable] = useState(true)
  const [working, setWorking] = useState(false)

  // 只在「打开」时初始化一次：保存后 config 会变，依赖 config 会把表单打回默认项。
  useEffect(() => {
    if (!open) return
    const current = useAppStore.getState().config
    if (!current) return
    const id = current.defaultProviderId ?? current.providers[0]?.id ?? null
    const provider = current.providers.find((p) => p.id === id) ?? null
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
    'w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-60'

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
      setNotice(`已保存「${next.name}」`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(false)
    }
  }

  async function handleSetDefault(): Promise<void> {
    if (!editingId) return
    setWorking(true)
    try {
      await saveConfig({ defaultProviderId: editingId })
      setNotice(`已将「${form?.name || editingId}」设为默认 Provider，新建画布会用它`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
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
      setNotice(
        remaining.length > 0 ? `已删除「${label}」${tail}` : `已删除「${label}」${tail}，请添加新的 Provider`
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
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
      setNotice('密钥已加密保存')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(false)
    }
  }

  async function handleRemoveKey(): Promise<void> {
    if (!editingId) return
    const status = await window.api.secrets.remove(editingId)
    setKeyStatus(status)
    setNotice('密钥已删除')
  }

  async function handleTest(): Promise<void> {
    if (!editingId) return
    setWorking(true)
    setNotice('测试中…')
    try {
      const result = await window.api.providers.test(editingId)
      setNotice(
        result.ok
          ? `连接成功，可用模型 ${result.models} 个`
          : `连接失败：${result.error ?? '未知错误'}`
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(false)
    }
  }

  async function handleFetchModels(): Promise<void> {
    if (!editingId || !form) return
    setWorking(true)
    setNotice('拉取模型列表…')
    try {
      const list = await window.api.providers.listModels(editingId)
      setModels(list)
      if (!form.defaultModel && list.length > 0) setForm({ ...form, defaultModel: list[0] })
      setNotice(
        list.length > 0
          ? `获取到 ${list.length} 个模型，点模型可设为默认模型`
          : '接口没有返回任何模型'
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setNotice(`拉取失败：${message}。请确认已保存 API Key 且 Base URL 可访问。`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex max-h-[86vh] w-[720px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-100">设置</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-200">
            ×
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-48 shrink-0 space-y-1 border-r border-slate-800 p-3">
            {config.providers.map((provider) => (
              <button
                type="button"
                key={provider.id}
                onClick={() => selectProvider(provider.id)}
                className={`flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-sm ${
                  provider.id === editingId
                    ? 'bg-slate-700/70 text-slate-100'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span className="flex-1 truncate">{provider.name || provider.id}</span>
                {config.defaultProviderId === provider.id && (
                  <span className="shrink-0 text-[10px] text-amber-300">★ 默认</span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setNotice('新 Provider：填好 ID / 名称 / Base URL 后点「保存」')
                applyProvider(null)
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-indigo-300 hover:bg-slate-800"
            >
              + 添加 Provider
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {config.providers.length === 0 && (
              <div className="rounded-lg border border-indigo-700/40 bg-indigo-500/10 px-4 py-3 text-xs leading-relaxed text-indigo-100">
                <div className="mb-1 text-sm font-medium text-indigo-100">还没有配置 Provider</div>
                填好下面的 Base URL 与 API Key，点右下角「保存」即可开始。若服务商兼容 /models
                接口，保存密钥后可以点「拉取模型列表」自动获取可用模型。
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-400">ID</span>
                <input
                  className={field}
                  value={form.id}
                  disabled={saved}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="例如 xiaomi"
                />
                {saved && <span className="text-[11px] text-slate-500">ID 创建后不可修改</span>}
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">名称</span>
                <input
                  className={field}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如 小米 MiMo"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Base URL</span>
              <input
                className={field}
                value={form.baseURL}
                onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
                placeholder="https://api.example.com/v1"
              />
              <span className="text-[11px] text-slate-500">需以 /v1 结尾（OpenAI 兼容接口）</span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-400">默认模型</span>
                <input
                  className={field}
                  value={form.defaultModel ?? ''}
                  onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
                  placeholder="例如 mimo-v2.6-pro"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">上下文窗口（用于 70% 提示）</span>
                <input
                  className={field}
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
                <span className="text-xs text-slate-400">API Key</span>
                <span className="text-xs text-slate-500">
                  {keyStatus?.hasKey ? `已保存 ${keyStatus.masked}` : '未保存'}
                </span>
              </div>
              {!encAvailable && (
                <p className="rounded bg-rose-900/40 px-2 py-1 text-xs text-rose-200">
                  当前系统不支持安全加密（safeStorage），无法保存密钥。
                </p>
              )}
              {!saved && (
                <p className="rounded bg-slate-800/60 px-2 py-1 text-xs text-slate-400">
                  先点「保存」创建 Provider，再填写 API Key。
                </p>
              )}
              <div className="flex gap-2">
                <input
                  className={field}
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-..."
                  disabled={!encAvailable || !saved}
                />
                <button
                  type="button"
                  disabled={!encAvailable || !saved || !keyInput.trim() || working}
                  onClick={() => void handleSaveKey()}
                  className="shrink-0 rounded bg-indigo-600 px-3 text-xs text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  保存密钥
                </button>
                <button
                  type="button"
                  disabled={!saved || !keyStatus?.hasKey}
                  onClick={() => void handleRemoveKey()}
                  className="shrink-0 rounded bg-slate-800 px-3 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  删除
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">模型列表（{models.length}）</span>
                <button
                  type="button"
                  disabled={!saved || working}
                  onClick={() => void handleFetchModels()}
                  className="rounded border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-slate-100 hover:border-indigo-500 hover:bg-slate-700 disabled:opacity-40"
                >
                  {working ? '拉取中…' : '拉取模型列表'}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                从该 Provider 的 /models 接口获取，需先保存 API Key。
              </p>
              <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded border border-slate-800 p-2">
                {models.length === 0 && <span className="text-xs text-slate-600">暂无</span>}
                {models.map((model) => (
                  <button
                    type="button"
                    key={model}
                    onClick={() => setForm({ ...form, defaultModel: model })}
                    title="设为默认模型"
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      form.defaultModel === model
                        ? 'bg-indigo-600/40 text-indigo-100'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>

            {notice && <p className="text-xs text-emerald-300">{notice}</p>}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-800 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {saved &&
              (confirmDeleteId === editingId ? (
                <>
                  <span className="text-xs text-rose-200">
                    确认删除「{form?.name || editingId}」？密钥会一并删除。
                  </span>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void handleDelete()}
                    className="rounded bg-rose-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-40"
                  >
                    确认删除
                  </button>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => setConfirmDeleteId(editingId)}
                  className="rounded bg-rose-900/50 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-900/80 disabled:opacity-40"
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
              className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            >
              测试连接
            </button>
            <button
              type="button"
              disabled={!saved || isDefault || working}
              title={isDefault ? '已经是默认 Provider' : '新建画布时将使用这个 Provider'}
              onClick={() => void handleSetDefault()}
              className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
            >
              {isDefault ? '★ 默认 Provider' : '设为默认'}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => void handleSave()}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              保存
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
