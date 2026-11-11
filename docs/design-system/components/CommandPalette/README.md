# CommandPalette

Walph's central search (⌘K): commands, files and (the differentiator) every open workspace with its Claude Code status, plus a shortcut to ask Claude.

**The consumer provides:** `items` (`id`, `label`, `group`, and optional `hint`, `icon`, `status`, `shortcut`), `onSelect(item)`, `onClose` (called after the exit animation; unmount there) and `onAskClaude(query)` to enable the "Perguntar ao Claude" row. The palette controls its own search and active item. `inline` renders it in the flow (previews and documentation).

- Group in this order: **Workspaces**, **Comandos**, **Arquivos**. Workspaces show the status dot in place of the icon.
- Enter: the background darkens in `duration-fast`; the panel drops 6px and scales from 0.98 in `duration-base` + `ease-out`. Exit: `duration-fast` + `ease-in`.
- The active item gets `bg-400` and a 2px `accent` bar that grows vertically (`duration-fast`).
- The matched text is in `accent-strong`, weight 600, never with a yellow background.
- **Light:** the panel has a static gradient border; the "Perguntar ao Claude" row uses the `spark` icon in gradient and the text in `.wp-grad-text`.
- Esc closes; clicking outside closes; ↑↓ navigate; ↵ opens.
