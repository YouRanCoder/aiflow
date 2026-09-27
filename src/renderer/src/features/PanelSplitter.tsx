interface Props {
  onMouseDown: (event: React.MouseEvent) => void
  onDoubleClick: () => void
  title?: string
}

/** 面板之间的可拖动分隔条；双击收起/展开对应面板 */
export function PanelSplitter({ onMouseDown, onDoubleClick, title }: Props) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={title}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className="group relative w-1 shrink-0 cursor-col-resize bg-slate-800/70 transition-colors hover:bg-indigo-500/70"
    >
      {/* 加宽可抓取区域，1px 的线也能轻松拖到 */}
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  )
}
