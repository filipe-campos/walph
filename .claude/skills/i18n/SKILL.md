---
name: i18n
description: Internationalization of Walph (pt-BR, English, Spanish): the shared message catalogs in src/shared/i18n, t() in main and useT() in the renderer, the workbench.language setting, locale-aware formatting and what is never translated. Use whenever code shows text to the user (JSX, toasts, errors thrown by main, dialogs, menus, quick picks, settings metadata) or formats numbers and dates.
---

# Internationalization (`src/shared/i18n/`)

The app ships in **pt-BR, English and Spanish**. Every user-visible string lives in a message catalog with the three
translations; code never contains UI copy. pt-BR is the reference language (unit tests and E2E run in it).

## Layout

| File | Role |
|---|---|
| `src/shared/i18n/locale.ts` | `LOCALES`, `Locale`, `LanguageSetting`, current locale (`getLocale`/`setLocale`/`onLocaleChange`), `resolveLocale` (system languages → supported locale, fallback `en`) |
| `src/shared/i18n/define.ts` | `defineMessages` (typed namespace with the 3 locales) and `plural` |
| `src/shared/i18n/format.ts` | `formatNumber`, `formatDate`, `formatList`, `compareText`: always in the current locale |
| `src/shared/i18n/messages/<namespace>.ts` | one namespace per domain (`common`, `app`, `commands`, `menu`, `settings`, `quickInput`, `files`, `git`, `search`, `editor`, `lsp`, `snippets`, `terminal`, `containers`, `claudeHost`, `claude`) |
| `src/shared/i18n/catalog.ts` | registers the namespaces; `Messages` type |
| `src/shared/i18n/index.ts` | public API: `t()`, `LOCALE_NAMES` and re-exports |
| `src/main/i18n/locale.ts` | main applies `workbench.language` (user layer only) on every read of the user `settings.json` |
| `src/renderer/src/i18n.ts` | `useT()` hook and `applyLocale` |

Flow: main resolves the locale (`workbench.language`, `system` = OS languages; `WALPH_LOCALE` env forces the "system"
language, used by E2E and `launch.sh`) → `--walph-locale=` argv on view creation (`window.api.locale`, first render
already translated) → `SettingsSnapshot.locale` on every change → `applyLocale` in the renderer (store `locale`,
`<html lang>`). Main rebuilds the native menu on `onLocaleChange`.

## Writing a message

```ts
// src/shared/i18n/messages/git.ts
import { defineMessages, plural } from '../define'

export const git = defineMessages({
  'pt-BR': {
    pushFailed: (branch: string) => `Falha ao enviar ${branch}`,
    changes: (n: number) => plural(n, '1 alteração', `${n} alterações`),
    view: { title: 'Controle de código-fonte' }
  },
  en: {
    pushFailed: (branch: string) => `Failed to push ${branch}`,
    changes: (n: number) => plural(n, '1 change', `${n} changes`),
    view: { title: 'Source Control' }
  },
  es: {
    pushFailed: (branch: string) => `No se pudo enviar ${branch}`,
    changes: (n: number) => plural(n, '1 cambio', `${n} cambios`),
    view: { title: 'Control de código fuente' }
  }
})
```

- `en` and `es` must have exactly the pt-BR keys and signatures: a missing, extra or mistyped entry is a type error.
- Keys in camelCase, grouped by component or flow (`git.view.title`, `git.errors.pushFailed`).
- Parameters are typed function arguments. One message per sentence: never glue translated fragments together
  (word order differs between languages). Plurals with `plural(n, one, other)` or an explicit ternary.
- A sentence with inline markup (e.g. `<code>` inside the text) is one string with `{name}` slots; the component splits
  it with `splitTemplate` (`src/renderer/src/lib/templateSlots.ts`) and renders each slot as an element.
- Generic words (OK, Cancel, Close, Save…) come from `common`; everything else goes to the domain namespace.
- New namespace = new file in `messages/` + one line in `catalog.ts`.

## Using it

```ts
// main, actions, pure libs: resolve at call time
import { t } from '@shared/i18n'
throw new UserError(t().git.pushFailed(branch))
notify(t().git.changes(count))
```

```tsx
// React components: the hook re-renders on language change
import { useT } from '../i18n'

export function GitView(): React.JSX.Element {
  const t = useT()
  return <h2 title={t.git.view.title}>{t.git.view.title}</h2>
}
```

## Rules

- **No UI literal in code**: JSX text, `title`/`aria-label`/`placeholder`/`alt`, `notify()`, toasts, errors thrown by
  main that reach the user, native dialogs, menu labels, quick pick items and details, status bar, settings labels,
  descriptions and validation warnings, empty states, CodeMirror/xterm widgets (`EditorState.phrases` for CodeMirror's
  built-in panels).
- The rule is lint-enforced: `no-restricted-syntax` in `eslint.config.mjs` rejects JSX text with 3+ letters and literal
  `title`/`placeholder`/`aria-label`/`alt` in `src/renderer/**/*.tsx` (tests excluded). Only product names (`Walph`,
  `Claude Code`, `Git`, `Docker`) and the content of `<code>`/`<kbd>`/`<samp>` (commands, keys, setting keys) may stay
  literal; anything else goes through `useT()`.
- **Never resolve at module load**: a module constant holding `t().x` freezes the language. Store keys or functions
  (`label: () => t().settings.sections.editor`), or build the list inside the function/component.
- `useMemo`/`useCallback` that produce text list `t` in their dependencies (each locale has its own catalog object).
- Formatting via `formatNumber`/`formatDate`/`formatList`/`compareText`; never hard-code `'pt-BR'` in `Intl` or
  `toLocale*`.
- Main messages are produced in main's locale, which is the renderer's (both come from the user `settings.json`).
  Prefer sending data/codes over IPC when the renderer formats the text itself.
- `workbench.language` is a user-only setting (the native menu belongs to the whole app).

**Never translated**: code comments (English, per CLAUDE.md), `console.*` logs, IPC channels, setting keys, command ids,
text sent to Claude/the CLI/language servers, test fixtures, product and brand names (Walph, Claude Code, Git, Docker),
user content, key names produced by `keybindingLabel`.

## Copy style per language

- **pt-BR**: the existing conventions (sentence case, verb first, `…` for actions that open something).
- **en**: Title Case for menu items, command titles and buttons, like VS Code ("Open Folder…", "Save All");
  sentence case for descriptions, messages and errors.
- **es**: neutral Latin American Spanish, sentence case everywhere, VS Code terminology ("Abrir carpeta…",
  "Guardar todo", "Paleta de comandos", "Explorador", "Control de código fuente").
- Glossary: workspace → en "workspace", es "espacio de trabajo"; branch → "rama" (es); commit, stash, diff, pull,
  push stay in English in all three when pt-BR keeps them; Settings → "Configuración" (es).

## Tests

- Unit tests run in pt-BR (`DEFAULT_LOCALE`) and assert the pt-BR text. To cover another language: `setLocale('en')`
  in the test and `setLocale('pt-BR')` in `afterEach`.
- `src/shared/i18n/i18n.test.ts` checks that every locale has the same keys and no empty text.
- E2E and the `app-testing` scripts force pt-BR with `WALPH_LOCALE` (`e2e/helpers.ts` `cleanEnv`).

## Checklist for new code

1. Text added to the domain namespace in the three languages.
2. Component uses `useT()`; non-component code calls `t()` at call time.
3. No module-level translated constant; memos depend on `t`.
4. Numbers, dates and sorting through `format.ts`.
5. `pnpm typecheck` proves the three catalogs match.
