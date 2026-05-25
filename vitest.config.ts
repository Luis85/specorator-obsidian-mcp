import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@@': fileURLToPath(new URL('./tests', import.meta.url)),
      // Obsidian ships only .d.ts files; stub it for unit tests.
      obsidian: fileURLToPath(new URL('./tests/__fakes__/obsidian.stub.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/plugin/**',
        'src/infrastructure/obsidian/**',
        'src/infrastructure/node/**',
        'src/infrastructure/mock/**',
      ],
      thresholds: { statements: 80, branches: 70, functions: 80, lines: 80 },
    },
  },
})
