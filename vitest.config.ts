import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@core': resolve('src/core')
    }
  }
})
