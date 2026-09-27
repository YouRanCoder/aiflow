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
    <div className="aiflow-markdown text-sm leading-relaxed text-slate-200" onContextMenu={onContextMenu}>
      {text ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown> : null}
      {!text && !generating && <span className="text-slate-500">（空回答）</span>}
      {generating && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-400" />}
    </div>
  )
}
