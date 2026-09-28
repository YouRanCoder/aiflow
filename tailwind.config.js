/**
 * 颜色全部走 CSS 变量（见 src/renderer/src/styles.css 里的 `--c-*`），
 * 深/浅两套主题只换变量，组件类名不变。
 * 变量里存的是 oklch 的「L C H」三元组，这里拼成 oklch(... / <alpha-value>)，
 * 这样 `bg-accent/20` 这类透明度修饰符依然可用。
 */
const role = (name) => `oklch(var(--c-${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 表面：画布 < 面板 < 抬升层
        canvas: role('canvas'),
        panel: role('panel'),
        raised: role('raised'),
        // 描边
        line: role('line'),
        'line-strong': role('line-strong'),
        // 文字
        fg: role('fg'),
        muted: role('muted'),
        faint: role('faint'),
        // 品牌强调色（主操作 / 选中 / 焦点）
        accent: {
          DEFAULT: role('accent'),
          hover: role('accent-hover'),
          soft: role('accent-soft'),
          text: role('accent-text'),
          line: role('accent-line')
        },
        'on-accent': role('on-accent'),
        // 状态
        warn: {
          DEFAULT: role('warn'),
          soft: role('warn-soft'),
          text: role('warn-text')
        },
        danger: {
          DEFAULT: role('danger'),
          soft: role('danger-soft'),
          text: role('danger-text')
        },
        ok: {
          DEFAULT: role('ok'),
          soft: role('ok-soft'),
          text: role('ok-text')
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI Variable Text',
          'Segoe UI',
          'system-ui',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei UI',
          'Microsoft YaHei',
          'Noto Sans SC',
          'sans-serif'
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'JetBrains Mono',
          'Cascadia Mono',
          'Segoe UI Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace'
        ]
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
        xl: '10px'
      },
      boxShadow: {
        elevated: 'var(--shadow-elevated)'
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }]
      }
    }
  },
  plugins: []
}
