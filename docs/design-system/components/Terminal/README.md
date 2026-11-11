# Terminal

The workspace terminal panel, with shell tabs and a special tab for the Claude Code session.

**The consumer provides:** `tabs` (`id`, `name`, `kind: 'shell' | 'claude'`, `status`), `activeId`, `onSelect`, `onAdd`, `cwd`, `branch` and `lines` (`kind`: `input`, `output`, `muted`, `info`, `success`, `warning`, `error`). In a real terminal, render xterm.js inside `.wp-term-body` and pass the `ansi-*` tokens as the theme (see README: Syntax and terminal).

- Prompt `❯` in `ansi-magenta`; output in `ink`; dimmed text in `ansi-bright-black`; info in `ansi-blue`; ok in `ansi-green`, warning in `ansi-yellow`, failure in `ansi-red`.
- Selection in `editor-selection`; cursor in `terminal-cursor`.
- `kind: 'claude'` tabs show the status dot in place of the terminal icon.
- The cursor is a **steady** `terminal-cursor` block: it does not blink. The only continuous motion in the interface is the *running* pulse.
- Workspace branch in `accent` next to the path, in `code-sm`.
- The "+" (new terminal) sits right after the last tab, as in `WorkspaceBar`; path and branch go to the right.

**Responsiveness**: the terminal reacts to the width of **its own panel** (container queries on `.wp-term`), not the window's, because it lives in a split that can be dragged to any size. Give the container a height (flex or fixed); the body scrolls and always sticks to the end, like a real terminal.

| panel width | header | body |
| --- | --- | --- |
| > 560px | tabs with name · full path · branch · "+" | 13/20, padding `space-4` |
| ≤ 560px | path becomes just the final folder (`billing-api`), whole; inactive tabs show only the icon/dot (name in the tooltip) | - |
| ≤ 400px | branch becomes an icon (name in the tooltip) | 12/18, padding `space-3` |
| ≤ 260px | tabs and "+" only | - |

- Tabs never wrap: they shrink with ellipsis (max. 180px) and the strip scrolls horizontally; the active one does not shrink and scrolls into view.
- Path and branch shrink before the tabs (at most 55% of the header); the full path is in `title`.
- Long lines break at any character and the continuation is indented 2 columns, aligned after the `❯`. Nothing scrolls horizontally.
