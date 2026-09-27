import type { Anchor, Node, Turn } from '@shared/types/domain'

export function renderAnchor(anchor: Anchor): string {
  if (anchor.kind === 'code') {
    const linePart =
      anchor.startLine !== undefined
        ? `:${anchor.startLine}${anchor.endLine !== undefined ? `-${anchor.endLine}` : ''}`
        : ''
    const location = anchor.file ? `${anchor.file}${linePart}` : ''
    const head = location ? `以下是我正在查看的代码（${location}）：` : '以下是我正在查看的代码：'
    const note = anchor.note ? `\n说明：${anchor.note}` : ''
    const lang = anchor.language ?? ''
    return `${head}${note}\n\`\`\`${lang}\n${anchor.code}\n\`\`\``
  }
  const head = anchor.source ? `（来源：${anchor.source}）\n` : ''
  return `${head}${anchor.text}`
}

/**
 * 话题分隔块：让模型知道接下来这些问答属于哪个话题。
 * 引用（来自父节点的选中文字）属于话题本身，所以放在这里而不是每一轮里。
 */
export function renderTopic(node: Node, options: { includeAnchor?: boolean } = {}): string {
  const parts = [`【话题】${node.title}`]
  if (node.quote) parts.push(`> 引用自父话题：「${node.quote.text}」`)
  if (options.includeAnchor && node.anchor) parts.push(renderAnchor(node.anchor))
  return parts.join('\n')
}

export function renderQuestion(turn: Turn): string {
  return `我的问题：${turn.question}`
}
