import { formatTokens } from '../lib/format'

interface Props {
  /** 当前分支已经占用的上下文 token（最近一次请求实际发送的输入量） */
  used: number
  /** 模型的上下文窗口 */
  total: number
  label?: string
}

/** 环形上下文占用指示器；鼠标停留显示 xxx / 窗口（已用 xx%） */
export function ContextRing({ used, total, label }: Props) {
  const ratio = total > 0 ? Math.min(1, used / total) : 0
  const percent = Math.round(ratio * 1000) / 10
  const color = ratio >= 0.9 ? '#fb7185' : ratio >= 0.7 ? '#fbbf24' : '#818cf8'

  const size = 26
  const stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  const tip = [
    label ? `话题「${label}」` : '当前分支',
    `上下文占用：${formatTokens(used)} / ${formatTokens(total)}（已用 ${percent}%）`,
    ratio >= 0.7 ? '已超过 70%，建议点「压缩上下文」把祖先话题压成摘要。' : ''
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      title={tip}
      aria-label={tip}
      className="flex shrink-0 cursor-help items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
    </div>
  )
}
