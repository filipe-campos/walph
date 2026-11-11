Walph is an IDE based on VS Code with a **Tech Premium AI** visual language: matte surfaces and light (cyan→blue→indigo gradients and a neon line running along borders) wherever there is AI or the primary action. Two ideas drive the interface: **every workspace in a single window** (the `WorkspaceBar` at the top) and **Claude Code tells you when it is done** (status on the tab + `Toast`). Everything else steps back so the code shows.

## Principles

- **Light means something.** Surfaces are matte; gradient and neon only appear where there is AI, focus or the primary action. A neon line running along a border means one thing: *the AI is working here*.
- **The agent has presence, not noise.** Claude Code status is an 8px dot on the tab; a notification is a counter and a toast, never a modal.
- **Subtle motion, always with a purpose.** Short transitions confirm state changes; the only continuous movements (pulse and trace) belong to the AI.

## Content and voice

- Brazilian Portuguese is the reference language (the app also ships English and Spanish through the i18n catalogs). Short sentences, sentence case: "Claude Code terminou", "Abrir workspace".
- No exclamation marks, no emoji, no trailing period in titles and buttons.
- Buttons start with a verb. Toasts say *what* in the title and *the result* in the description: "4 arquivos alterados · testes passando".
- Workspace names, branches, paths and shortcuts in `code-sm` (mono).

## Themes

Two themes share the same tokens, roles and rules: **Dark** (the default, the one this guide describes) and **Light**. In `tokens.json` each color token has `value` (dark) and `light`.

- Light keeps the same layers, roles and hues (blue `accent`, indigo and cyan only as light, teal/amber/coral for status), with values darkened so text stays ≥4.5:1 on `bg-100`…`bg-300` and syntax ≥5:1 in the editor.
- Text on the brand gradient stays white (`on-accent`) in both themes.
- Never write a color for a single theme: use the token, and both themes follow.
- The app themes (`src/renderer/src/themes/walphDark.ts`, `walphLight.ts`) are the source of the values; a test keeps `tokens.json` in sync with them.

## Color

Depth layers, from the bottom up:

| token | where |
| --- | --- |
| `bg-000` | window and `WorkspaceBar` |
| `bg-100` | editor and terminal |
| `bg-200` | sidebar, explorer, editor tab strip |
| `bg-300` | toasts, menus, active workspace tab |
| `bg-400` | hover |

- Text in `ink`; secondary in `ink-muted`; placeholders and shortcuts in `ink-faint` (never on `bg-400`).
- `accent` (#4da6ff, neon blue) is the primary action, the active tab, focus and the *running* status. Text on it is `on-accent`. Tinted background behind accent text: `accent-soft`.
- `accent-2` (indigo) and `accent-3` (cyan) exist only for light: gradients, the neon line and AI icons. Never as body text or area background.
- Status: `success` (teal, *done*), `warning` (*attention*), `danger` (coral, *error*), each with its `*-soft`. Status never relies on color alone: there is always an icon, letter or word with it.
- `line` is a decorative hairline; control borders use `line-strong` (3:1).
- Keyboard focus: `focus-ring`, 2px solid with a 2px offset, on everything focusable.
- Scrollbars: `accent` thumb at 55% on a transparent track, thin, across the whole IDE (global rule in `bundle.css`); on hover the thumb becomes full `accent`. Tab strips that scroll horizontally hide the bar.

## Typography

Geist for the interface, JetBrains Mono for code (both from Google Fonts, loaded by `bundle.css`). Compact IDE scale: `label` (12px) on tabs and buttons, `body` (13px) for default text, `title` (15px) on toasts and panels, `caption` (11px, uppercase) for section headers such as "EXPLORER". `display` only on empty screens. Code in `code` (13/20).

## Space, radius and shadow

- 4px grid: `space-1` (icon to text gap), `space-2` (tab padding), `space-3` (buttons and inputs), `space-4` (toasts), `space-6` (toast margin from the window).
- `radius-md` (6px) on buttons, inputs and workspace tabs; `radius-lg` (10px) on toasts and menus; `radius-sm` on explorer items; `radius-pill` on dots and counters.
- No shadows on fixed surfaces. `shadow-pop` only on what floats (toast, menu). `shadow-glow` on the primary button on hover; `shadow-neon` under cards with a light border.

## Light: gradients and neon

The recipes live in `bundle.css`, built from the color tokens (change `accent` and everything follows):

| recipe | from | where |
| --- | --- | --- |
| `--grad-brand` | `accent` → `accent-2` | primary button, send, checked checkbox |
| `--grad-ai` | `accent-3` → `accent` → `accent-2` | `.wp-grad-text` ("Claude Code", "Perguntar ao Claude"), AI icons |
| `--grad-ring` | `accent` → `line` → `accent-3` | static highlight border (`.wp-neon`) |
| `--grad-trace-stops` | stops of the conic comet `accent-2` → `accent` → `accent-3` | neon line running along the border (`.wp-neon-live`); the `conic-gradient(from var(--wp-angle), …)` is built on the element itself |
| `--grad-surface` | 4% of `ink` → transparent | sheen at the top of elevated cards |
| `--grad-aurora` | three radial halos | `Welcome` background; never behind code |

**Neon line (trace)**

- `.wp-neon` draws a 1px ring on the `border-box` under the background (`--wp-neon-fill`). `.wp-neon-live` spins a comet around the border every `duration-trace`, followed by a blurred glow. `.wp-neon-hover` only runs on hover.
- **Live = AI working**: workspace tab with Claude running, the `ClaudePanel` compose box while it runs, `info` toast, the "Comece com o Claude" field on `Welcome`, `NeonCard trace="live"`.
- **Static = result or highlight**: active tab, Claude summary, `done` toast, command palette.
- The animated angle (`--wp-angle`, registered with `@property`) only spins if the `conic-gradient` is declared on the animated element; a variable holding the whole gradient on `:root` freezes the comet.
- At most three live traces visible. Never a gradient behind long text; text on a gradient is always `on-accent`.

## Motion

Every animation uses the `duration-*` and `ease-*` tokens. Transitions up to 320ms; the only continuous movements are the *running* pulse, the neon trace and the notification counter pulse, all of them coming from the AI.

| what | duration | curve | movement |
| --- | --- | --- | --- |
| hover, press | `duration-instant` | `ease-standard` | color; button shrinks to 0.97 |
| switch tab, editor tab indicator, "x" appearing | `duration-fast` | `ease-standard` / `ease-out` | color; accent line grows from the center |
| new tab, toast entering, folder opening | `duration-base` | `ease-out` | rises 4–8px and fades in |
| toast leaving | `duration-slow` | `ease-in` | slides 12px right and fades out |
| Claude Code *running* | `duration-pulse` | `ease-breathe` | dot breathes with an `accent-glow` halo |
| Claude Code finished / asked for something | 900ms × 2 | `ease-out` | single ping on the dot + counter enters with a slight overshoot |
| unread notification counter | `duration-pulse` | `ease-out` | halo in the counter color expands 6px and fades, continuously until read |
| command palette | `duration-fast` (backdrop) · `duration-base` (panel) | `ease-out` | panel drops 6px and scales from 0.98 |
| new message in the Claude panel | `duration-base` | `ease-out` | rises 4px and fades in |
| Claude thinking | `duration-pulse` | `ease-linear` | two light comets run through the two Vs of the symbol; a sheen crosses the word "Pensando" |
| welcome screen | `duration-base` + `duration-stagger` | `ease-out` | blocks rise 4px in sequence, 40ms apart |
| AI working (border) | `duration-trace` | `ease-linear` | neon comet circles the border, continuously |
| hover on the primary button | `duration-sheen` | `ease-out` | a band of light crosses the button once |
| clickable card | `duration-fast` | `ease-out` | rises 2px; trace on hover |
| modal | `duration-fast` (backdrop, 6px blur) · `duration-base` (panel) | `ease-out` / `ease-in` on exit | panel rises 8px and scales from 0.97 |
| your last message pinned at the top of the Claude panel | `duration-fast` | `ease-out` | drops 4px and fades in |
| Claude question: switching questions | `duration-base` | `ease-out` | rises 4px and fades in; the option mark pops |

- Entrances use `ease-out`, exits `ease-in`, in-place changes `ease-standard`.
- Move at most 8px. Do not animate layout (width/height); animate `transform` and `opacity`.
- `prefers-reduced-motion`: every duration goes to 0ms, the pulse becomes a static halo, the trace stops (border in a fixed `--grad-ai`) and the sheen disappears.
- The terminal cursor does not blink: continuous movement is reserved for the AI.

## Claude Code notifications

1. The agent starts → `status: 'running'` on the workspace tab.
2. The agent finishes, asks for permission or fails → status becomes `done`, `attention` or `error`; the dot pings.
3. If the workspace is **not** active: increment `unread` (the tab gets a counter in the status color, without changing its background) and show a `Toast` with the workspace name and the "Abrir workspace" action.
4. If it is active: only the `Toast`.
5. When the workspace is opened, reset `unread` and turn `done` back into `idle`.
6. Each workspace can have **several Claude sessions** in parallel, as tabs in the `ClaudePanel`. The workspace tab shows the most urgent status among them (`attention` > `error` > `running` > `done` > `idle`) and the sum of the `unread` counts.
7. Inside the workspace, the `ClaudePanel` shows each session's status on its tab and, in the active session, a permission request becomes a `warning` card with Permitir / Sempre neste workspace / Negar; when it finishes, a summary with the files and `+N −N`.
8. In the `CommandPalette` (⌘K), workspaces appear with their status dot, and any search can become "Perguntar ao Claude".

`attention` and `error` never dismiss themselves; `done` can auto-dismiss (`duration`, paused on hover).

## Logo and app icon

The symbol is **two overlapping Vs that form a W**: the front one in `accent-3` → `accent`, the back one in `accent` → `accent-2`, separated by a thin gap. It is Walph's central idea (several workspaces side by side in a single window) drawn as a letter. The word "walph" is Geist SemiBold in lowercase, −2% tracking, outlined.

- Files in the **Logos** group (full, mono, for light backgrounds; the symbol in the same three versions) and the `Logo` component for React.
- Clear space: half the symbol height. Minimums: 20px high for the full logo, 16px for the symbol.
- Do not recolor, rotate or split the two Vs, do not add an outline, shadow or animation, and do not use the word without the symbol.
- **App icon** (**Aplicativo** group): dark, flat background (no halo or shadow behind the symbol), a sheen at the top and a thin ring with the neon line light. macOS as a squircle on Apple's grid (824 of 1024, with shadow); Windows and Linux as a square with 18% corners. From 16 to 40px there is a simplified version with a larger symbol.

## Iconography

Custom icons in `Walph.Icons` (**Icons** page): 16px grid, 1.35 stroke, round caps and joins, **duotone** (the main shape gets a 16% fill of the same color under the stroke). They use `currentColor`: `ink-muted` at rest, `ink` on hover, `accent` when highlighted. AI icons (`spark`, `agent`, `brain`, the last one being the Claude panel mark) are drawn with `--grad-ai` in stroke and fill; inside the primary button they go back to `on-accent`. In cards, the icon sits in a 32px square with a 12% `accent` background and a 30% outline. No emoji. The status bar marks the file type with `{ }` in mono `accent`.

**File and folder icons** (`FileIcon`, **FileIcon** page): a theme in the spirit of the VS Code icon themes, drawn in the Walph style. Languages become colored labels with their abbreviation (`TS`, `PY`, `GO`…); configs, data and media become duotone glyphs in the type color; folders are solid in the color of their name category (`src`, `components`, `migrations`, `.github`, `node_modules`, `.claude`…) with the glyph cut out in the corner. There are more than 430 files and 71 folder categories. The explorer, editor tabs and Claude attachments use the theme automatically.

## Syntax and terminal

The editor and the terminal share a palette: in Dark, light pastel tones on `bg-100`, all above 5:1, so the neon blue of the UI stays the only neon on screen.

| token | where |
| --- | --- |
| `syn-keyword` | `import`, `const`, `return`, `if` (lilac) |
| `syn-function` | functions and methods (blue) |
| `syn-type` | types, classes, JSX components (teal) |
| `syn-string` | strings and paths (peach) |
| `syn-number` | numbers, booleans, `null` (coral) |
| `syn-constant` | `UPPER_CASE`, enums (yellow) |
| `syn-property` | properties, attributes, JSON keys (periwinkle) |
| `syn-tag` | HTML/JSX tags, CSS selectors (pink) |
| `syn-variable` · `syn-operator` · `syn-comment` | aliases of `ink`, `ink-muted` and `ink-faint`; comments in italics |

- Editor: cursor line in `editor-line-active`, selection in `editor-selection`, search in `editor-match`, line numbers in `editor-gutter` / `editor-gutter-active`, guides in `editor-indent-guide`.
- Terminal (xterm.js): the 16 `ansi-*` map directly to `black`…`brightWhite`; in Dark, `ansi-red` and `ansi-yellow` are the same values as `danger` and `warning`; `ansi-magenta` is a true magenta and the ❯ prompt uses `accent`. `ansi-green` is a true green (CLIs expect green for PASS) and is set apart from `ansi-red` by luminance. Cursor in `terminal-cursor`, steady.
- Build the editor theme (CodeMirror) from these tokens; never write hex values in the editor theme.
- The `Code` component shows the applied theme.

## Welcome screen

`Welcome` appears when no workspace is open: start actions (open folder, clone, terminal), a field to start straight from Claude Code and the recent folders, with multiple selection to open several workspaces at once, or "Abrir todos" to restore the session. The blocks enter in sequence with `duration-stagger`.

## Window layout

From top to bottom: `WorkspaceBar` (52px, `bg-000`); then three columns: `Sidebar` (a 44px vertical icon column in `bg-000` with Explorer, Search, Source Control and Containers at the top and Settings at the bottom, plus the ~240px view in `bg-200`), the editor with `EditorTab`s and the `Terminal` below it (`bg-100`), and the `ClaudePanel` on the right (360px, `bg-200`); and, below everything, the `StatusBar` (24px, `bg-000`, full width) with the project path, branch, commits to push/pull, last commit, cursor, encoding, line ending and file type. The editor starts with the `EditorTabs` (tabs + split editor and Markdown preview on the right). Toasts float in the bottom right corner of the editor, `space-6` from the edges. With no workspace open, the center shows `Welcome`. Opening **Containers** in the column, the `ContainersView` replaces everything to the right of the column (explorer, editor, terminal and Claude panel) until you pick another view. The **AppShell** page shows the whole window.

## Shortcuts

`⌘1`…`⌘9` switch workspace · `⌘K` command palette · `⌘L` focus Claude Code · `⇧⌘L` new Claude session · `⌃Tab` cycle sessions · `⇧Tab` (in the Claude field) cycle the execution mode · `` ⌃` `` terminal · `⌘O` open folder as a workspace · `⇧⌘E` explorer · `⇧⌘F` search · `⌃⇧G` source control · `⇧⌘D` containers · `⌘\` split editor · `⇧⌘V` Markdown preview · `/` (in the Claude field) commands · `⌃G` go to line · `⌘,` settings.

## Components

`window.Walph` (React 18): `WorkspaceBar`, `WorkspaceTab`, `Toast`, `Button`, `Input`, `EditorTab`, `TreeItem`, `CommandPalette`, `Terminal`, `ClaudePanel`, `Code`, `Welcome`, `NeonCard`, `Sidebar`, `Modal` (with `SettingRow`, `Switch` and `Select` for Settings), `Menu`, `ContainersView` (Docker), `EditorTabs`, `ClaudeQuestion` (Claude Code questions), `StatusBar`, `Logo` and `FileIcon` (file and folder icon theme). Load `tokens.css`, then `components/bundle.css`, then `components/bundle.js`.
