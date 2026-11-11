# Toast

The floating notification, in the bottom right corner, that tells you when Claude Code finishes, asks for something or fails.

**The consumer provides:** `tone`, `title`, `workspace` (source name), optional `branch` and `workspacePath`, `description`, optional actions and `onDismiss` (called after the exit animation; remove the toast from the list there). Stack them inside a `<div class="wp-toasts">`.

- `done` → "Claude Code terminou" + summary ("4 arquivos alterados · testes passando") + action "Abrir workspace".
- `attention` and `error` do not auto-dismiss: the user must act. Use `duration` (e.g. 6000) only on `done` and `info`; the progress bar pauses on hover.
- Enter: `duration-base` + `ease-out`, rises 8px. Exit: `duration-slow` + `ease-in`, slides 12px to the right.
- **Light:** `done` gets a static gradient border; `info` (AI messages) has the neon line running around it. `attention` and `error` have no light: the alert comes from the icon color.
- **Source workspace:** in a card as wide as the toast, behind it; only the top strip (28px) shows, like a tab sticking out from behind the main card. Background `bg-200` darkening downward (one tone below the toast, so it reads as "behind"), `line` outline on the top and sides, `layers` icon in the tone color, name in mono and branch in `ink-faint`. On enter, it rises 16px from behind the toast after the toast appears (`duration-slow`, delay `duration-fast`); it leaves together. The full path is in the tooltip.
- **Timer bar** (with `duration`): 2px in `--grad-ai` with `accent-glow` glow, shrinking from right to left; pauses on hover.
- Short, sentence-case titles, no final period, no exclamation mark.
- If the source workspace is not active, besides the toast, increment the tab's `unread` in `WorkspaceBar`.
