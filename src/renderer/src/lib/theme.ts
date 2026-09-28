import { useEffect, useState } from 'react'
import type { UiConfig } from '@shared/types/config'

export type ThemePreference = UiConfig['theme']
export type ResolvedTheme = 'light' | 'dark'

const LIGHT_QUERY = '(prefers-color-scheme: light)'

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark'
  }
  return preference
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme
}

/**
 * 把配置里的主题偏好落到 `<html data-theme>`；选「跟随系统」时监听系统外观变化。
 * 返回当前实际生效的主题，供需要按主题分支的地方使用。
 */
export function useTheme(preference: ThemePreference): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference))

  useEffect(() => {
    setResolved(resolveTheme(preference))
    if (preference !== 'system') return
    const media = window.matchMedia(LIGHT_QUERY)
    const sync = (): void => setResolved(media.matches ? 'light' : 'dark')
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [preference])

  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  return resolved
}
