import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  text: string
  generating?: boolean
  /** 选中文字后右键时回调，用于「根据这段文字新建子话题」 */
  onContextMenu?: (event: React.MouseEvent) => void
}

export function Answer({ text, generating = false, onContextMenu }: Props) {
  return (
    <div className="aiflow-markdown text-sm text-fg" onContextMenu={onContextMenu}>
      {text ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown> : null}
      {!text && !generating && <span className="text-faint">（空回答）</span>}
      {generating && (
        <span
          className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-accent"
          aria-hidden="true"
        />
      )}
    </div>
  )
}
