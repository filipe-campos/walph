import { builtinModules } from 'node:module'
import { defineConfig } from 'eslint/config'
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vitest from '@vitest/eslint-plugin'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import importX from 'eslint-plugin-import-x'
import playwright from 'eslint-plugin-playwright'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const TESTS = ['**/*.test.{ts,tsx,mts,mjs}']

// Layers: the rules below are the CLAUDE.md contract (shared knows nobody, renderer does not touch Node/main, preload
// only forwards). `no-restricted-imports` in a later block replaces the earlier one for the same files, so each set of
// files gets the full list.
const NODE_BUILTINS = builtinModules.filter((name) => !name.startsWith('_'))
const NODE_PATHS = ['electron', ...NODE_BUILTINS].map((name) => ({
  name,
  message: 'This layer cannot use Electron or Node modules.'
}))
const NODE_PATTERNS = [{ group: ['node:*'], message: 'This layer cannot use Node modules.' }]
const LAYER_PATTERN = (layer, extra = {}) => ({
  group: [`**/${layer}`, `**/${layer}/**`],
  message: `This layer cannot import from ${layer}/.`,
  ...extra
})

const sharedImports = (withNode) => ({
  paths: withNode ? NODE_PATHS : [],
  patterns: [
    ...(withNode ? NODE_PATTERNS : []),
    LAYER_PATTERN('main'),
    LAYER_PATTERN('renderer'),
    LAYER_PATTERN('preload')
  ]
})
// `src/preload/index.d.ts` only declares `window.api`: the renderer can import types from it.
const rendererImports = (withNode, extraPatterns = []) => ({
  paths: withNode ? NODE_PATHS : [],
  patterns: [
    ...(withNode ? NODE_PATTERNS : []),
    LAYER_PATTERN('main'),
    LAYER_PATTERN('preload', { allowTypeImports: true }),
    ...extraPatterns
  ]
})
const STORE_PATTERNS = [
  {
    group: ['./*Actions', './diskSync', './workspaceLifecycle', './storeReactions'],
    message: 'store.ts does not import action modules (cycle): they are the ones that import the store.'
  }
]

const FS_WRITERS = ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream']
// `promises` opens another object with the same writers; `write`/`writeSync` write to an open descriptor.
const FS_IMPORT_BANNED = [...FS_WRITERS, 'promises', 'write', 'writeSync']
const FS_MODULES = ['node:fs', 'node:fs/promises', 'fs', 'fs/promises']
// Only the registrars (`ipc/**`, `index.ts`, `menu.ts`) know `ipc/*`; the domain never depends on the channel layer.
// Regex because `@shared/ipc` (types only) must not match.
const NO_IPC_IMPORT = {
  regex: '(^|/)ipc/',
  message:
    'Only ipc/**, index.ts and menu.ts import ipc/*. Domains get `send` from window/send.ts, validators from validate/.'
}
// An ipc/<domain>.ts only wires its own domain: what another domain exposes comes from `<domain>/registry.ts`.
const IPC_SIBLINGS = {
  group: ['./*', '../ipc/*', '!./typed', '!../ipc/typed'],
  message: 'An ipc/<domain>.ts does not import another ipc/<domain>.ts (only ./typed): move the code up to the domain.'
}
const mainImports = (...extraPatterns) => ({
  paths: FS_MODULES.map((name) => ({
    name,
    importNames: FS_IMPORT_BANNED,
    message: 'Disk writes go through fs/atomicWrite.ts (writeFileAtomic, writeFileAtomicSync, writeJsonAtomicSync).'
  })),
  patterns: [LAYER_PATTERN('renderer'), ...extraPatterns]
})
const FS_WRITER_NAMES = `/^(?:${FS_WRITERS.join('|')})$/`
const FS_WRITER_MESSAGE =
  'Disk writes go through fs/atomicWrite.ts (writeFileAtomic, writeFileAtomicSync, writeJsonAtomicSync).'
// An error crossing IPC with translated text must be a UserError: `handle` replaces any other with "unexpected error".
const USER_ERROR_SYNTAX = [
  {
    selector: "NewExpression[callee.name='Error'] CallExpression[callee.name='t']",
    message: 'A translated message (t()) goes in `new UserError(...)` (src/main/errors.ts), not in `new Error(...)`.'
  }
]
const FS_WRITER_SYNTAX = [
  { selector: `CallExpression > MemberExpression[property.name=${FS_WRITER_NAMES}]`, message: FS_WRITER_MESSAGE },
  {
    selector: `VariableDeclarator > ObjectPattern > Property[key.name=${FS_WRITER_NAMES}]`,
    message: FS_WRITER_MESSAGE
  }
]

// UI text comes from the catalogs (`useT()`). Left out are product names (never translated) and the content of
// `<code>`, `<kbd>` and `<samp>` (commands, keys and setting keys).
const BRANDS = 'Walph|Claude Code|Git|Docker'
const LETTER = 'A-Za-zÀ-ÿ'
// A word of `min` letters or more that does not start with a product name.
const foreignWord = (min) => `(?<![${LETTER}])(?<!Claude )(?!(?:${BRANDS})(?![${LETTER}]))[${LETTER}]{${min},}`
const UI_ATTRS = '^(?:title|placeholder|aria-label|alt)$'
const TEXT_PARENT = ':matches(JSXFragment, JSXElement:not([openingElement.name.name=/^(?:code|kbd|samp)$/]))'
const TEXT_MESSAGE = 'UI text comes from the i18n catalog (useT()), not from JSX.'
const ATTR_MESSAGE = 'title, placeholder, aria-label and alt come from the i18n catalog (useT()), not from a literal.'
const UI_TEXT_SYNTAX = [
  { selector: `${TEXT_PARENT} > JSXText[value=/${foreignWord(3)}/]`, message: TEXT_MESSAGE },
  { selector: `${TEXT_PARENT} > JSXExpressionContainer > Literal[value=/${foreignWord(3)}/]`, message: TEXT_MESSAGE },
  {
    selector: `${TEXT_PARENT} > JSXExpressionContainer > TemplateLiteral[expressions.length=0] > TemplateElement[value.raw=/${foreignWord(3)}/]`,
    message: TEXT_MESSAGE
  },
  { selector: `JSXAttribute[name.name=/${UI_ATTRS}/] > Literal[value=/${foreignWord(2)}/]`, message: ATTR_MESSAGE },
  {
    selector: `JSXAttribute[name.name=/${UI_ATTRS}/] > JSXExpressionContainer > Literal[value=/${foreignWord(2)}/]`,
    message: ATTR_MESSAGE
  },
  {
    selector: `JSXAttribute[name.name=/${UI_ATTRS}/] > JSXExpressionContainer > TemplateLiteral[expressions.length=0] > TemplateElement[value.raw=/${foreignWord(2)}/]`,
    message: ATTR_MESSAGE
  }
]
// Outside store.ts and the components, state is read and written through the `get`/`set` exported by the store.
const STORE_ACCESS_SYNTAX = [
  {
    selector: "MemberExpression[object.name='useStore'][property.name=/^(?:getState|setState)$/]",
    message: "Import `get`/`set` from './store' instead of useStore.getState/setState."
  },
  {
    selector: "VariableDeclarator[init.name='useStore'] > ObjectPattern > Property[key.name=/^(?:getState|setState)$/]",
    message: "Import `get`/`set` from './store' instead of destructuring getState/setState from useStore."
  }
]

const typeAwareRules = {
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-deprecated': 'error',
  '@typescript-eslint/prefer-promise-reject-errors': 'error',
  '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  '@typescript-eslint/require-await': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error'
}

export default defineConfig(
  {
    ignores: [
      'out/',
      'dist/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'coverage/',
      '.claude/',
      // Exported from the design tool.
      'docs/design-system/',
      'src/main/lsp/fixtures/fakeServer.cjs'
    ]
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { 'import-x': importX },
    settings: {
      ...importX.flatConfigs.typescript.settings,
      'import-x/resolver': undefined,
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: [
            'tsconfig.node.json',
            'tsconfig.node.test.json',
            'tsconfig.web.json',
            'tsconfig.web.test.json',
            'tsconfig.e2e.json'
          ],
          noWarnOnMultipleProjects: true
        })
      ]
    },
    rules: {
      ...typeAwareRules,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        // `default` handles the rest on purpose; the rule catches switches without a default that miss a new case.
        { considerDefaultExhaustiveForUnions: true }
      ],
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['error', 'warn'] }]
    }
  },
  { files: ['src/**/*.{ts,tsx}'], ignores: TESTS, rules: { 'import-x/no-cycle': 'error' } },
  // State and actions do not depend on React components (the normal direction is the reverse). Via import-x because
  // `no-restricted-imports` only sees the import text, which does not include the `.tsx` extension.
  {
    files: ['src/renderer/src/*.ts'],
    ignores: TESTS,
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/renderer/src/*.ts',
              from: './src/renderer/src/**/*.tsx',
              message:
                'State and action modules do not import components (.tsx): move the code to a module without React.'
            }
          ]
        }
      ]
    }
  },
  // JS is not in any tsconfig: no rules that depend on types.
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },
  // Main, preload, configs and E2E tests run in Node.
  {
    files: ['src/main/**', 'src/preload/**', 'src/shared/**', 'e2e/**', '*.config.{ts,mts,mjs}', 'scripts/**'],
    languageOptions: { globals: globals.node }
  },
  // Layers.
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    ignores: TESTS,
    rules: { 'no-restricted-imports': ['error', sharedImports(true)] }
  },
  {
    files: ['src/shared/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', sharedImports(false)] }
  },
  {
    files: ['src/main/**/*.ts'],
    ignores: [...TESTS, 'src/main/fs/atomicWrite.ts'],
    rules: {
      'no-restricted-imports': ['error', mainImports(NO_IPC_IMPORT)],
      'no-restricted-syntax': ['error', ...FS_WRITER_SYNTAX, ...USER_ERROR_SYNTAX]
    }
  },
  // A later block replaces the earlier one for the same files: so these repeat `mainImports` without `NO_IPC_IMPORT`.
  {
    files: ['src/main/index.ts', 'src/main/menu.ts'],
    ignores: TESTS,
    rules: { 'no-restricted-imports': ['error', mainImports()] }
  },
  {
    files: ['src/main/ipc/**/*.ts'],
    ignores: TESTS,
    rules: { 'no-restricted-imports': ['error', mainImports(IPC_SIBLINGS)] }
  },
  // Main logs only through `createLog` (src/main/log.ts).
  { files: ['src/main/**/*.ts'], ignores: [...TESTS, 'src/main/log.ts'], rules: { 'no-console': 'error' } },
  {
    files: ['src/main/**/*.test.ts', 'src/main/fs/atomicWrite.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [LAYER_PATTERN('renderer')] }] }
  },
  {
    files: ['src/preload/**/*.ts'],
    ignores: TESTS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!electron$|@shared/|\\./buildApi$)',
              message: 'The preload only imports electron, ./buildApi and @shared (forwards calls, no logic).'
            },
            {
              regex: '^@shared/(?!ipcSpec$)',
              allowTypeImports: true,
              message: 'The preload only imports types from @shared, except the channel spec (@shared/ipcSpec).'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ignores: TESTS,
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      'no-restricted-imports': ['error', rendererImports(true)]
    }
  },
  {
    files: ['src/renderer/**/*.test.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      'no-restricted-imports': ['error', rendererImports(false)]
    }
  },
  {
    files: ['src/renderer/src/store.ts'],
    rules: { 'no-restricted-imports': ['error', rendererImports(true, STORE_PATTERNS)] }
  },
  {
    files: ['src/renderer/**/*.tsx'],
    ignores: [...TESTS, 'src/renderer/src/components/**', 'src/renderer/src/store.ts'],
    rules: { 'no-restricted-syntax': ['error', ...UI_TEXT_SYNTAX, ...STORE_ACCESS_SYNTAX] }
  },
  {
    files: ['src/renderer/src/components/**/*.tsx'],
    ignores: TESTS,
    rules: { 'no-restricted-syntax': ['error', ...UI_TEXT_SYNTAX] }
  },
  {
    files: ['src/renderer/**/*.ts'],
    ignores: [...TESTS, 'src/renderer/src/components/**', 'src/renderer/src/store.ts'],
    rules: { 'no-restricted-syntax': ['error', ...STORE_ACCESS_SYNTAX] }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [...TESTS, 'src/main/testing/**', 'src/main/claude/testing/**', 'src/renderer/src/test/**'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'error',
      // `||` on string/boolean is usually intentional ('' and false count as missing).
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true, boolean: true } }]
    }
  },
  // The Playwright reporter, the scripts/ CLIs and the test measurements write to stdout on purpose.
  { files: ['e2e/**', 'scripts/**'], rules: { 'no-console': 'off' } },
  // Tests.
  {
    files: ['e2e/**/*.ts'],
    plugins: { playwright },
    rules: {
      'playwright/no-wait-for-timeout': 'error',
      'playwright/missing-playwright-await': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }]
    }
  },
  {
    files: TESTS,
    plugins: { vitest },
    rules: {
      'vitest/no-focused-tests': 'error',
      'vitest/expect-expect': 'error',
      // `async` mocks that fulfill a Promise signature, `JSON.parse` of fixtures and the Vitest asymmetric matchers
      // (`expect.stringContaining` returns `any`) are the norm in tests.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off'
    }
  },
  // Local helpers that wrap `expect`.
  {
    files: ['src/main/git/cloneUrl.test.ts'],
    plugins: { vitest },
    rules: { 'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'ok', 'bad'] }] }
  },
  {
    files: ['src/shared/lspPosition.test.ts'],
    plugins: { vitest },
    rules: { 'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expectEquivalent'] }] }
  }
)
