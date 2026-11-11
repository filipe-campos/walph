---
name: renderer-styles
description: Styling patterns of the renderer (CSS tokens and the styles/*.css files, codicons, VS Code-like density, themes for UI/CodeMirror/xterm). Use when writing or reviewing CSS, colors, icons, layout or themes.
---

# Styles (`src/renderer/src/styles.css` + `styles/*.css`)

## Rules

- All styles live in `src/renderer/src/styles/*.css` (no CSS-in-JS, no inline colors). `styles.css` only `@import`s
  them, and the import order IS the cascade order: put a rule in the file of its area and never reorder the imports
  without checking the overrides. Moving a rule earlier can silently change an override (a rule that used to lose to a
  later one now wins), so grep every class on the same element before moving it.
- Colors **only** through tokens `var(--…)` defined in `:root`. Need a new color → create a token.
- Classes in kebab-case, scoped by component (`.git-file`, `.search-match`). Reuse the generic ones first
  (see the `renderer-components` skill).
- The visual language is the **Walph design system** ("Tech Premium AI"): matte layered surfaces, and light
  (gradients, neon line) only where there is AI, focus or the primary action. Copy is translated (pt-BR, en, es; `i18n` skill),
  verb first.
- Icons, in this order: **design-system icons** `<Icon name="…" />` (`components/common/Icon.tsx`: 16px grid, 1.35
  stroke, duotone, `currentColor`; AI icons `spark`/`agent`/`bolt`/`brain` paint `--grad-ai`, `plain` drops it) for
  anything the set covers (shell chrome, tabs, Claude panel, status bar, welcome); **file/folder icons** `<FileIcon
  name=… folder? open? />` (`components/common/FileIcon.tsx`, tables in `lib/fileIcons.ts`) wherever a file or folder
  is listed; **codicons** `<i className="codicon codicon-<name>" />` for everything else. No other icon library.
  `IconButton` takes `glyph` (design-system icon) or `icon` (codicon).
- Brand: `<Logo variant="full" | "symbol" size={…} />` (`components/common/Logo.tsx`); never animate or recolor it.

## Stylesheet map (import order = cascade order)

| File | Holds |
|---|---|
| `tokens.css` | `:root` constants: fonts, `--ui-font-size` and `--text-*`, spacing, radii, motion, gradients |
| `base.css` | reset, `button` reset and disabled state, scrollbars, focus ring |
| `controls.css` | `.icon-button` and the canonical buttons (see "Buttons") |
| `workbench.css` | workspace bar, activity bar, sidebar, explorer, git, search, shared rows and badges |
| `editor.css`, `welcome.css`, `panel.css`, `statusbar.css`, `overlays.css`, `tabs.css` | editor area and CodeMirror widgets, welcome screen, bottom panel and terminal, status bar, quick input and toasts, conflict bar |
| `claude-tabs.css` → `claude-timeline.css` → `claude-cards.css` → `claude-prompt.css` → `claude-panels.css` | Claude panel: shell, header and session tabs; body, timeline and tools; permission/question cards; prompt box, menus and chips; dropdown, pinned prompt, turn summary, favorites, agents, history |
| `settings.css`, `mcp.css`, `usage.css`, `containers.css`, `claude-events.css` | Settings modal, MCP manager, usage modal, Containers screen, Claude event rows |
| `motion.css` | always last: the `prefers-reduced-motion` overrides |

The `claude-*` files are contiguous slices of one cascade: keep new rules in the file of their area, but do not move a
rule across files without checking overrides of equal specificity.

## Typography

Font sizes only through `--text-*` (defined in `tokens.css` as fractions of `--ui-font-size`, which `appearance.ts`
sets on `:root` from `workbench.fontSize`) or `calc(var(--ui-font-size) * N / 13)` for a one-off ratio; **never px for
text**. px stays for icon sizes (`16px` codicons) and `em` for the Markdown preview.

| Token | At 13px | Design-system style |
|---|---|---|
| `--text-micro` | 10 | (not named by the design system) |
| `--text-caption` | 11 | `caption` |
| `--text-label` | 12 | `label` |
| `--text-body` | 13 | `body` |
| `--text-title` | 15 | `title` |

```css
/* ✅ CORRECT */
.problem-row.error { color: var(--danger); }

/* ❌ WRONG — hardcoded color, breaks themes */
.problem-row.error { color: #f85149; }
```

Inline `style` is allowed only for dynamic geometry (widths/heights from resizers, tree indentation).

## Tokens

**Source of truth: `THEME_TOKENS` in `src/renderer/src/themes/types.ts`** (names from the design system's
`tokens.json`). Every token is a key of `Theme.colors` and must have a value in each theme file (`themes/walphDark.ts`
= the design system's exact values, `walphLight.ts` = a light adaptation; the type forces completeness and
`themes.test.ts` checks it). Do not maintain a token list here — read that file. Roles:

| token | where |
|---|---|
| `bg-000` | window, activity bar, status bar |
| `bg-100` | editor, terminal, inputs |
| `bg-200` | sidebar, panels, editor tab strip, panel headers |
| `bg-300` | elevated: toasts, menus, palette, active tab/session |
| `bg-400` | hover |
| `line` / `line-strong` | decorative hairlines / control borders (3:1) |
| `ink` / `ink-muted` / `ink-faint` | text / secondary text and icons / placeholders and shortcuts (never on `bg-400`) |
| `accent`, `accent-strong`, `accent-soft`, `accent-glow`, `on-accent`, `focus-ring` | primary action, focus, active, `running`; text on gradients is `on-accent` |
| `accent-2`, `accent-3` | only light: gradients, neon, AI icons — never body text or area backgrounds |
| `success`/`warning`/`danger` (+ `-soft`) | done / attention / error; status is never color alone |
| `syn-*`, `editor-*`, `diff-*` | CodeMirror (via `themes/editorTheme.ts`, which uses only `var(--…)`) |
| `diagnostic-*`, `git-*` | LSP and git decorations |
| `scrim`, `shadow-pop`, `shadow-glow`, `shadow-neon` | overlay backdrop; floating surfaces; primary hover; neon cards |

Non-themed constants live in `styles/tokens.css` `:root`: `--font-sans` (Geist) / `--font-mono` (JetBrains Mono), both
bundled via `@fontsource` in `main.tsx` (the CSP forbids remote fonts); `--space-1…8`, `--radius-sm/md/lg/pill`,
`--duration-*`, `--ease-*`, and the light recipes `--grad-brand`, `--grad-ai`, `--grad-ring`, `--grad-surface`,
`--grad-aurora`, `--grad-trace-stops`. `--editor-font-size`/`--editor-font-family` come from settings.

## Light, motion and status

- `.neon` = static 1px gradient ring (highlight / AI result); `.neon-live` = comet tracing the border (**only** while
  the AI works; at most three visible). The element needs `--neon-fill`, no own border/background; an element with its
  own animation must list both animations in one rule.
- Primary action = `.button-primary` (`--grad-brand`, sheen on hover); secondary = `.button-secondary`; ghost =
  `.button-ghost` (text) or `.icon-button` (icon only). At most one primary per area.
- Motion only through `--duration-*`/`--ease-*`: entries `ease-out` (rise ≤8px), exits `ease-in`, in-place
  `ease-standard`; animate `transform`/`opacity`, never layout. Continuous motion is reserved for AI status
  (`StatusDot` pulse, neon trace, thinking dots). The global `prefers-reduced-motion` block in `styles/motion.css` (always the
  last import, so its overrides win) must cover every new continuous animation.
- `StatusDot` (`components/common/StatusDot.tsx`, `idle|running|done|attention|error`) with its `aria-label`.

## Buttons (`styles/controls.css`)

Canonical: `.button` plus one variant (`.button-primary`, `.button-secondary`, `.button-ghost`, `.button-danger`, the
destructive action of a confirmation) and optionally `.button-sm` (24px) or `.button-xs` (22px, caption text); default
md is 28px. Render them through `Button` (`components/common/Button.tsx`), icon-only ones through `IconButton`
(`.icon-button`) and on/off ones through `Toggle` (`.toggle`); never write the classes by hand in a component. The old
`.primary-button`, `.secondary-button` and `.claude-button` aliases no longer exist. `.conflict-button` (24px, own
`.primary` variant in `tabs.css`, flat gradient without sheen) is the only remaining separate button class, used by the
`CodeEditor` conflict bar. A busy control is `aria-disabled` (the shared `button[aria-disabled='true']` rule in `base.css` dims it; the hover/active rules of the buttons and `.toggle` skip it with `:not([aria-disabled='true'])`), not `disabled`, so focus stays on it.

New color = add the token to `THEME_TOKENS` **and** to every theme; the CSS files only consume `var(--token)`.

## Density (match VS Code)

- UI font 13/20 (`body`); labels 12px/500; captions 11px/500 uppercase +0.04em; list rows 22px with `radius-sm`;
  sidebar headers 35px; editor tab strip 38px (tabs 32px); panel header 32px; status bar 28px; activity bar 48px.
- Mono (`--font-mono`, `code-sm` 12/16) for branches, paths, shortcuts and counts.
- Scrollbars use the shared `::-webkit-scrollbar` rules (accent thumb at 55%) — don't restyle per component; tab
  strips that scroll horizontally hide the bar.

## Themes

- Every color is a token in `THEME_TOKENS`; a theme defines all of them plus the CodeMirror extension (every theme
  shares `themes/editorTheme.ts`, which reads `var(--syn-*)`) and an xterm `ITheme` with concrete colors (xterm can't
  read CSS variables).
- The bundled fonts load before the first render (`main.tsx`) because xterm measures its cell once.
- A theme (`themes/*.ts`) is `{ name, kind, colors, terminal, editor }`; `themes/index.ts` registers them (`THEMES`,
  `findTheme`, `DEFAULT_THEME`). `workbench.theme` in settings picks one by name (unknown name: warning + default).
- `appearance.ts` (`startAppearance`, subscribed to the store, outside components) applies the active theme:
  `THEME_TOKENS` → CSS custom properties on `:root`, `color-scheme` from `kind`, `theme.editor` into the CodeMirror
  theme compartment (`setEditorTheme`). The active name is `selectThemeName(state)`: the preview (`themePreview`) wins
  over the configured one.
- The xterm theme comes from `theme.terminal`; `TerminalPanel.tsx` updates every live terminal when the theme changes.
  Never keep a separate hardcoded palette in the editor or the terminal.
- `themes/cache.ts` keeps the last configured theme in `localStorage` (name + token colors + `color-scheme`). The
  classic script `public/themeBoot.js` (loaded from `index.html` `<head>`, before the CSS and modules; no inline scripts
  because of the CSP) applies those colors to `:root` on first paint, avoiding the dark flash. Its storage format is a
  contract with `cache.ts`. Previews are never cached.
- Theme picker (`openThemePicker`, QuickInput with `picker: 'theme'`): arrows preview, Enter calls `selectTheme`
  before closing (applies once; writes `.walph/settings.json` if it defines `workbench.theme`, else the user's), Esc reverts. The mouse only highlights (`.hover-only`).
