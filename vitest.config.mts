import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const alias = {
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  '@renderer': resolve(import.meta.dirname, 'src/renderer/src')
}

// Coverage instrumentation makes the code several times slower: timing tests turn themselves off with it.
const coverage = process.argv.some((arg) => arg.startsWith('--coverage'))

export default defineConfig({
  test: {
    // The tests check the pt-BR texts: the "system language" cannot depend on the machine.
    env: { WALPH_LOCALE: 'pt-BR', ...(coverage ? { WALPH_COVERAGE: '1' } : {}) },
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    // Thresholds = coverage measured on macOS rounded down, minus 1 point (CI measures on Linux, which skips the
    // darwin-only tests); they only go up. `src/shared/*.ts` leaves out the i18n catalogs.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/fixtures/**', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 69,
        statements: 67,
        branches: 64,
        functions: 56,
        'src/main/**': { lines: 83, statements: 81, branches: 78, functions: 77 },
        'src/main/claude/**': { lines: 90, statements: 88, branches: 84, functions: 86 },
        'src/main/lsp/**': { lines: 93, statements: 89, branches: 84, functions: 90 },
        'src/shared/*.ts': { lines: 91, statements: 90, branches: 93, functions: 74 },
        'src/renderer/**': { lines: 61, statements: 59, branches: 53, functions: 53 },
        'src/renderer/src/lib/**': { lines: 95, statements: 94, branches: 90, functions: 93 }
      }
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/main/**/*.test.ts',
            'src/preload/**/*.test.ts',
            'src/shared/**/*.test.ts',
            'scripts/**/*.test.mjs'
          ]
        }
      },
      {
        resolve: { alias },
        test: {
          name: 'renderer',
          pool: 'vmThreads',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/renderer/src/test/setup.ts'],
          // Without this Vitest replaces all CSS with empty, even with `?raw` (themes.test.ts reads the tokens).
          css: { include: [/styles\/tokens\.css/] }
        }
      }
    ]
  }
})
