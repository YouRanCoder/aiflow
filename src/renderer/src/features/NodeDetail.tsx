import { useMemo, useState } from 'react'
import type { NodeWithTurns } from '@shared/types/domain'
import { Answer } from './Answer'
import { ContextMenu, type MenuState } from './ContextMenu'
import { formatTokens } from '../lib/format'
import { computeBranchInfo } from '../lib/tokens'
import { useAppStore } from '../store/useAppStore'

interface Props {
  width: number
  collapsed: boolean
  onToggleCollapse: () => void
}

export function NodeDetail({ width, collapsed, onToggleCollapse }: Props) {
  const detail = useAppStore((s) => s.detail)
  const selectedNodeId = useAppStore((s) => s.selectedNodeId)
  const generatingMap = useAppStore((s) => s.generating)
  const streaming = useAppStore((s) => s.streaming)
  const isGenerating = useAppStore((s) => s.isGenerating())
  const busy = useAppStore((s) => s.busy)

  const selectNode = useAppStore((s) => s.selectNode)
  const askTurn = useAppStore((s) => s.askTurn)
  const generateTurn = useAppStore((s) => s.generateTurn)
  const regenerate = useAppStore((s) => s.regenerate)
  const removeTurn = useAppStore((s) => s.removeTurn)
  const promoteTurn = useAppStore((s) => s.promoteTurn)
  const setActiveMessage = useAppStore((s) => s.setActiveMessage)
  const cancel = useAppStore((s) => s.cancel)
  const compact = useAppStore((s) => s.compact)
  const uncompact = useAppStore((s) => s.uncompact)
  const addNode = useAppStore((s) => s.addNode)
  const renameNode = useAppStore((s) => s.renameNode)

  const [draft, setDraft] = useState('')
  const [childDraft, setChildDraft] = useState('')
  const [addingChild, setAddingChild] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)

  const node: NodeWithTurns | null = useMemo(() => {
    if (!detail || !selectedNodeId) return null
    return detail.nodes.find((n) => n.id === selectedNodeId) ?? null
  }, [detail, selectedNodeId])

  const branchInfo = useMemo(() => computeBranchInfo(detail?.nodes ?? []), [detail])

  const ancestors = useMemo(() => {
    if (!detail || !node) return []
    const byId = new Map(detail.nodes.map((n) => [n.id, n]))
    const chain: NodeWithTurns[] = []
    let cursor = node.parentId
    while (cursor) {
      const current = byId.get(cursor)
      if (!current) break
      chain.push(current)
      cursor = current.parentId
    }
    return chain.reverse()
  }, [detail, node])

  const isEmptyCanvas = (detail?.nodes.length ?? 0) === 0

  async function submitRoot(): Promise<void> {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await addNode(null, title)
  }

  async function submitTurn(): Promise<void> {
    if (!node) return
    const question = draft.trim()
    if (!question) return
    setDraft('')
    await askTurn(node.id, question)
  }

  async function submitChild(): Promise<void> {
    if (!node) return
    const title = childDraft.trim()
    setChildDraft('')
    setAddingChild(false)
    if (title) await addNode(node.id, title)
  }

  /** 在回答里选中文字后右键 → 用这段文字新建子话题 */
  function openSelectionMenu(event: React.MouseEvent, messageId?: string): void {
    const text = window.getSelection()?.toString().trim()
    if (!text || !node) return
    event.preventDefault()
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: '根据这段文字新建子话题',
          onSelect: () => {
            const title = text.length > 30 ? `${text.slice(0, 30)}…` : text
            void addNode(node.id, title, { parentNodeId: node.id, text, messageId })
          }
        }
      ]
    })
  }

  const field =
    'w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-indigo-500'

  // 收起后只留一条窄边条，点一下再展开
  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-2 border-l border-slate-800 bg-slate-900/40 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="展开话题详情"
          className="rounded px-1 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          «
        </button>
        <span className="text-[11px] tracking-widest text-slate-500 [writing-mode:vertical-rl]">
          话题详情
        </span>
      </div>
    )
  }

  return (
    <section
      style={{ width }}
      className="flex shrink-0 flex-col border-l border-slate-800 bg-slate-900/40"
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">话题详情</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="收起话题详情"
          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          »
        </button>
      </div>

      {node && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 px-3 py-2 text-xs">
          {[...ancestors, node].map((item, index, list) => {
            const isCurrent = index === list.length - 1
            return (
              <span key={item.id} className="flex items-center gap-1 whitespace-nowrap">
                <button
                  type="button"
                  disabled={isGenerating || isCurrent}
                  title={item.title}
                  onClick={() => selectNode(item.id)}
                  className={`max-w-[170px] truncate rounded px-1 py-0.5 disabled:cursor-default ${
                    isCurrent
                      ? 'text-slate-200'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`}
                >
                  {item.title}
                </button>
                {!isCurrent && <span className="text-slate-600">›</span>}
              </span>
            )
          })}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isEmptyCanvas && (
          <div className="rounded-lg border border-slate-800 bg-slate-800/40 px-4 py-4">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">当前画布</div>
            <div className="mt-1 text-sm font-medium text-slate-100">{detail?.canvas.title}</div>
            {detail?.canvas.description && (
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
                {detail.canvas.description}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              这是空画布。先在下方写下根话题（例如「C语言指针」）——这一步
              <strong className="text-slate-300">不会调用模型</strong>；之后可以右键话题添加子话题，
              或直接在这个话题里提问。
            </p>
          </div>
        )}

        {node && (
          <>
            {/* 话题标题 */}
            <div className="rounded-lg bg-slate-800/60 px-3 py-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">话题</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => {
                      setTitleDraft(node.title)
                      setRenaming(true)
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => {
                      setChildDraft('')
                      setAddingChild(true)
                    }}
                    className="text-[11px] text-indigo-300 hover:text-indigo-200 disabled:opacity-40"
                  >
                    + 子话题
                  </button>
                </div>
              </div>

              {renaming ? (
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const title = titleDraft.trim()
                    setRenaming(false)
                    if (title && title !== node.title) void renameNode(node.id, title)
                  }}
                >
                  <input
                    autoFocus
                    className={field}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setRenaming(false)
                    }}
                  />
                  <button type="submit" className="shrink-0 rounded bg-indigo-600 px-3 text-xs text-white">
                    确定
                  </button>
                </form>
              ) : (
                <div className="text-sm font-medium text-slate-100">{node.title}</div>
              )}

              {node.quote && (
                <div className="mt-2 rounded border-l-2 border-amber-500/60 bg-amber-500/5 px-2 py-1 text-xs text-amber-200">
                  引用自父话题：「{node.quote.text}」
                </div>
              )}

              {node.anchor && node.anchor.kind === 'code' && (
                <pre className="mt-2 overflow-x-auto rounded bg-slate-950/80 p-2 text-xs text-slate-300">
                  {node.anchor.code}
                </pre>
              )}
            </div>

            {addingChild && (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitChild()
                }}
              >
                <input
                  autoFocus
                  className={field}
                  value={childDraft}
                  onChange={(event) => setChildDraft(event.target.value)}
                  placeholder="子话题名，例如「什么是地址」"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setAddingChild(false)
                  }}
                />
                <button type="submit" className="shrink-0 rounded bg-indigo-600 px-3 text-xs text-white">
                  添加
                </button>
              </form>
            )}

            {node.summary && (
              <div className="rounded-lg border border-amber-600/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                <div className="mb-1 flex items-center justify-between">
                  <span>祖先话题已压缩</span>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => void uncompact(node.id)}
                    className="text-amber-300 underline disabled:opacity-40"
                  >
                    展开原文
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-amber-200/80">{node.summary}</p>
              </div>
            )}

            {/* 轮次列表 */}
            {node.turns.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-800 px-3 py-4 text-center text-xs text-slate-500">
                这个话题还没有提问。在下方输入框提问，问答会留在这个话题里。
              </p>
            )}

            {node.turns.map((turn, index) => {
              const active =
                turn.messages.find((m) => m.isActive) ?? turn.messages[turn.messages.length - 1] ?? null
              const generating = Boolean(generatingMap[turn.id])
              const live = streaming[turn.id]
              const pending = turn.messages.length === 0 && !generating

              return (
                <div key={turn.id} className="overflow-hidden rounded-lg border border-slate-800">
                  <div className="border-b border-slate-800 bg-slate-800/40 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-slate-500">
                        第 {index + 1} 轮
                      </span>
                      <div className="flex shrink-0 gap-2">
                        {pending ? (
                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() => void generateTurn(turn.id)}
                            className="rounded bg-indigo-600 px-2 py-0.5 text-[11px] text-white hover:bg-indigo-500 disabled:opacity-40"
                          >
                            生成回答
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() => void regenerate(turn.id)}
                            className="text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
                          >
                            重新生成
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isGenerating}
                          title="把这一轮问答移出来，成为当前话题下的一个子话题"
                          onClick={() => void promoteTurn(turn.id)}
                          className="text-[11px] text-indigo-300 hover:text-indigo-200 disabled:opacity-40"
                        >
                          转为子话题
                        </button>
                        <button
                          type="button"
                          disabled={isGenerating}
                          title="只删除这一轮问答"
                          onClick={() => void removeTurn(turn.id)}
                          className="text-[11px] text-rose-300 hover:text-rose-200 disabled:opacity-40"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-slate-100">{turn.question}</div>
                  </div>

                  <div className="bg-slate-950/50 px-3 py-3">
                    {active?.error ? (
                      <div className="text-sm text-rose-300">{active.error}</div>
                    ) : (
                      <Answer
                        text={live !== undefined ? live : (active?.content ?? '')}
                        generating={generating}
                        onContextMenu={(event) => openSelectionMenu(event, active?.id)}
                      />
                    )}

                    {generating && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => void cancel(turn.id)}
                          className="rounded bg-rose-700 px-2 py-1 text-[11px] text-white hover:bg-rose-600"
                        >
                          停止生成
                        </button>
                      </div>
                    )}

                    {turn.messages.length > 1 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-800 pt-2">
                        <span className="text-[11px] text-slate-500">版本：</span>
                        {turn.messages.map((message, versionIndex) => (
                          <button
                            type="button"
                            key={message.id}
                            disabled={isGenerating}
                            onClick={() => void setActiveMessage(turn.id, message.id)}
                            className={`rounded px-1.5 text-[11px] disabled:opacity-40 ${
                              message.isActive
                                ? 'bg-indigo-600/40 text-indigo-100'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            v{versionIndex + 1}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                      <span>输入 {formatTokens(active?.usagePrompt ?? 0)}</span>
                      <span>缓存命中 {formatTokens(active?.usageCached ?? 0)}</span>
                      <span>输出 {formatTokens(active?.usageCompletion ?? 0)}</span>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span className="text-slate-400">
                本分支总计：{formatTokens(branchInfo.get(node.id)?.tokens.total ?? 0)}
              </span>
              <span>本话题 {node.turns.length} 轮</span>
            </div>
          </>
        )}
      </div>

      {node && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 px-3 py-2">
          <button
            type="button"
            disabled={isGenerating || busy || !node.parentId}
            onClick={() => void compact(node.id)}
            title={node.parentId ? '把祖先话题的全部问答压缩成一条摘要' : '根话题无需压缩'}
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            压缩上下文
          </button>
          <span className="text-[11px] text-slate-500">
            删除话题请在该话题上右键（每一轮问答自己的「删除」只删那一轮）
          </span>
        </div>
      )}

      <div className="border-t border-slate-800 p-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              if (node) void submitTurn()
              else void submitRoot()
            }
          }}
          disabled={isGenerating}
          rows={3}
          placeholder={
            node
              ? `在「${node.title}」里提问（Cmd/Ctrl + Enter 发送）`
              : '写下根话题，例如：C语言指针'
          }
          className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-500 disabled:opacity-50"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] leading-snug text-slate-500">
            {node
              ? '问答会留在这个话题里；加子话题用上方「+ 子话题」或右键'
              : '创建后会成为根话题，此时不调用模型'}
          </span>
          <button
            type="button"
            disabled={isGenerating || !draft.trim()}
            onClick={() => (node ? void submitTurn() : void submitRoot())}
            className="shrink-0 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {node ? '提问' : '创建根话题'}
          </button>
        </div>
      </div>

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </section>
  )
}
