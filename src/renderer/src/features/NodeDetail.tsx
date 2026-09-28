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

const field =
  'w-full rounded-md border border-line bg-raised px-2 py-1.5 text-sm text-fg transition-colors placeholder:text-faint focus:border-accent-line'

const metaButton = 'text-2xs transition-colors disabled:opacity-40'

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

  // 收起后只留一条窄边条，点一下再展开
  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-2 border-l border-line bg-panel py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="展开话题详情"
          aria-label="展开话题详情"
          className="rounded px-1 py-0.5 text-muted transition-colors hover:bg-raised hover:text-fg"
        >
          «
        </button>
        <span className="text-2xs tracking-widest text-faint [writing-mode:vertical-rl]">
          话题详情
        </span>
      </div>
    )
  }

  return (
    <section style={{ width }} className="flex shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-2xs text-faint">话题详情</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="收起话题详情"
          aria-label="收起话题详情"
          className="rounded px-1.5 py-0.5 text-muted transition-colors hover:bg-raised hover:text-fg"
        >
          »
        </button>
      </div>

      {node && (
        <div className="scroll-stable flex items-center gap-0.5 overflow-x-auto border-b border-line px-3 py-1.5 text-xs">
          {[...ancestors, node].map((item, index, list) => {
            const isCurrent = index === list.length - 1
            return (
              <span key={item.id} className="flex items-center gap-0.5 whitespace-nowrap">
                <button
                  type="button"
                  disabled={isGenerating || isCurrent}
                  title={item.title}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => selectNode(item.id)}
                  className={`max-w-[170px] truncate rounded px-1 py-0.5 transition-colors disabled:cursor-default ${
                    isCurrent
                      ? 'text-fg'
                      : 'text-muted hover:bg-raised hover:text-fg'
                  }`}
                >
                  {item.title}
                </button>
                {!isCurrent && (
                  <span className="text-faint" aria-hidden="true">
                    ›
                  </span>
                )}
              </span>
            )
          })}
        </div>
      )}

      <div className="scroll-stable flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {isEmptyCanvas && (
          <div className="rounded-md border border-line bg-raised px-3 py-3">
            <div className="text-2xs text-faint">当前画布</div>
            <div className="mt-1 text-sm font-medium text-fg">{detail?.canvas.title}</div>
            {detail?.canvas.description && (
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                {detail.canvas.description}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted">
              这是空画布。先在下方写下根话题（例如「C语言指针」）——这一步
              <strong className="font-medium text-fg">不会调用模型</strong>；之后可以右键话题添加子话题，
              或直接在这个话题里提问。
            </p>
          </div>
        )}

        {node && (
          <>
            {/* 话题标题 */}
            <div className="rounded-md border border-line bg-raised px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-2xs text-faint">话题</span>
                <div className="flex shrink-0 gap-2.5">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => {
                      setTitleDraft(node.title)
                      setRenaming(true)
                    }}
                    className={`${metaButton} text-muted hover:text-fg`}
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
                    className={`${metaButton} text-accent-text hover:text-accent-text/80`}
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
                    aria-label="话题名"
                    className={field}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setRenaming(false)
                    }}
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-md bg-accent px-3 text-xs text-on-accent transition-colors hover:bg-accent-hover"
                  >
                    确定
                  </button>
                </form>
              ) : (
                <div className="text-sm font-medium text-fg">{node.title}</div>
              )}

              {node.quote && (
                <div className="mt-2 rounded-md border border-line px-2.5 py-1.5">
                  <div className="text-2xs text-faint">引用自父话题</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted">{node.quote.text}</div>
                </div>
              )}

              {node.anchor && node.anchor.kind === 'code' && (
                <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-canvas p-2 font-mono text-xs text-muted">
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
                  aria-label="子话题名"
                  className={field}
                  value={childDraft}
                  onChange={(event) => setChildDraft(event.target.value)}
                  placeholder="子话题名，例如「什么是地址」"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setAddingChild(false)
                  }}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-md bg-accent px-3 text-xs text-on-accent transition-colors hover:bg-accent-hover"
                >
                  添加
                </button>
              </form>
            )}

            {node.summary && (
              <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn-text">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span>祖先话题已压缩</span>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => void uncompact(node.id)}
                    className="rounded underline transition-colors hover:no-underline disabled:opacity-40"
                  >
                    展开原文
                  </button>
                </div>
                <p className="whitespace-pre-wrap opacity-90">{node.summary}</p>
              </div>
            )}

            {/* 轮次列表 */}
            {node.turns.length === 0 && (
              <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-faint">
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
                <div key={turn.id} className="overflow-hidden rounded-md border border-line">
                  <div className="border-b border-line bg-raised px-3 py-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="tnum text-2xs text-faint">第 {index + 1} 轮</span>
                      <div className="flex shrink-0 items-center gap-2.5">
                        {pending ? (
                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() => void generateTurn(turn.id)}
                            className="rounded-md bg-accent px-2 py-0.5 text-2xs text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
                          >
                            生成回答
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() => void regenerate(turn.id)}
                            className={`${metaButton} text-muted hover:text-fg`}
                          >
                            重新生成
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isGenerating}
                          title="把这一轮问答移出来，成为当前话题下的一个子话题"
                          onClick={() => void promoteTurn(turn.id)}
                          className={`${metaButton} text-accent-text hover:text-accent-text/80`}
                        >
                          转为子话题
                        </button>
                        <button
                          type="button"
                          disabled={isGenerating}
                          title="只删除这一轮问答"
                          onClick={() => void removeTurn(turn.id)}
                          className={`${metaButton} text-danger-text hover:text-danger-text/80`}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-fg">{turn.question}</div>
                  </div>

                  <div className="px-3 py-3">
                    {active?.error ? (
                      <div className="text-sm text-danger-text">{active.error}</div>
                    ) : (
                      <Answer
                        text={live !== undefined ? live : (active?.content ?? '')}
                        generating={generating}
                        onContextMenu={(event) => openSelectionMenu(event, active?.id)}
                      />
                    )}

                    {generating && (
                      <div className="mt-2.5">
                        <button
                          type="button"
                          onClick={() => void cancel(turn.id)}
                          className="rounded-md border border-danger/40 bg-danger-soft px-2 py-1 text-2xs text-danger-text transition-colors hover:border-danger"
                        >
                          停止生成
                        </button>
                      </div>
                    )}

                    {turn.messages.length > 1 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-2">
                        <span className="text-2xs text-faint">版本</span>
                        {turn.messages.map((message, versionIndex) => (
                          <button
                            type="button"
                            key={message.id}
                            disabled={isGenerating}
                            aria-pressed={message.isActive}
                            onClick={() => void setActiveMessage(turn.id, message.id)}
                            className={`tnum rounded px-1.5 py-0.5 text-2xs transition-colors disabled:opacity-40 ${
                              message.isActive
                                ? 'bg-accent-soft text-accent-text'
                                : 'text-muted hover:bg-raised hover:text-fg'
                            }`}
                          >
                            v{versionIndex + 1}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="tnum mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-faint">
                      <span>输入 {formatTokens(active?.usagePrompt ?? 0)}</span>
                      <span aria-hidden="true">·</span>
                      <span>缓存命中 {formatTokens(active?.usageCached ?? 0)}</span>
                      <span aria-hidden="true">·</span>
                      <span>输出 {formatTokens(active?.usageCompletion ?? 0)}</span>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="tnum flex flex-wrap items-center gap-x-2.5 text-2xs text-faint">
              <span className="text-muted">
                本分支总计 {formatTokens(branchInfo.get(node.id)?.tokens.total ?? 0)}
              </span>
              <span aria-hidden="true">·</span>
              <span>本话题 {node.turns.length} 轮</span>
            </div>
          </>
        )}
      </div>

      {node && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          <button
            type="button"
            disabled={isGenerating || busy || !node.parentId}
            onClick={() => void compact(node.id)}
            title={node.parentId ? '把祖先话题的全部问答压缩成一条摘要' : '根话题无需压缩'}
            className="rounded-md border border-line px-2 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
          >
            压缩上下文
          </button>
          <span className="text-2xs leading-snug text-faint">
            删除话题请在该话题上右键；每一轮自己的「删除」只删那一轮
          </span>
        </div>
      )}

      <div className="border-t border-line p-3">
        <textarea
          value={draft}
          aria-label={node ? `在「${node.title}」里提问` : '写下根话题'}
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
          placeholder={node ? `在「${node.title}」里提问（Cmd/Ctrl + Enter 发送）` : '写下根话题，例如：C语言指针'}
          className="w-full resize-none rounded-md border border-line bg-raised px-2.5 py-2 text-sm text-fg transition-colors placeholder:text-faint focus:border-accent-line disabled:opacity-50"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-2xs leading-snug text-faint">
            {node ? '问答会留在这个话题里；加子话题用上方「+ 子话题」或右键' : '创建后会成为根话题，此时不调用模型'}
          </span>
          <button
            type="button"
            disabled={isGenerating || !draft.trim()}
            onClick={() => (node ? void submitTurn() : void submitRoot())}
            className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {node ? '提问' : '创建根话题'}
          </button>
        </div>
      </div>

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </section>
  )
}
