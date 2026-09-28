import type { ReactNode } from 'react'
import type { ThemePreference } from '../lib/theme'

function SystemIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.7" y="2.9" width="12.6" height="8.2" rx="1.2" />
      <path d="M5.7 13.5h4.6" />
    </svg>
  )
}

function SunIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.3v1.5M8 13.2v1.5M1.3 8h1.5M13.2 8h1.5M3.3 3.3l1.06 1.06M11.64 11.64l1.06 1.06M12.7 3.3l-1.06 1.06M4.36 11.64 3.3 12.7" />
    </svg>
  )
}

function MoonIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />
    </svg>
  )
}

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: () => ReactNode }> = [
  { value: 'system', label: '跟随系统外观', Icon: SystemIcon },
  { value: 'light', label: '浅色', Icon: SunIcon },
  { value: 'dark', label: '深色', Icon: MoonIcon }
]

interface Props {
  value: ThemePreference
  onChange: (next: ThemePreference) => void
}

export function ThemeToggle({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="界面主题"
      className="flex items-center gap-0.5 rounded-md border border-line p-0.5"
    >
      {OPTIONS.map(({ value: option, label, Icon }) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(option)}
            className={`flex h-5 w-6 items-center justify-center rounded transition-colors ${
              active
                ? 'bg-accent-soft text-accent-text'
                : 'text-faint hover:bg-raised hover:text-muted'
            }`}
          >
            <Icon />
          </button>
        )
      })}
    </div>
  )
}
