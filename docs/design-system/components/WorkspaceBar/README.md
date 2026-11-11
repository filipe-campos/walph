# WorkspaceBar

The bar at the top of the window that gathers every open workspace in a single Walph window, replacing having several VS Code windows open.

**The consumer provides:** `workspaces` (list with `id`, `name`, `branch`, `status`, `unread`), `activeId`, and the handlers `onSelect`, `onClose`, `onAdd`. The bar is controlled: it keeps no state.

**Behavior**

- Always in `bg-000`, 52px tall, above everything (including the editor tab strip).
- Every tab is 204×42px, whatever its status; with many tabs, the bar scrolls horizontally. The "+" sits right after the last tab.
- `⌘1`…`⌘9` switch workspaces; the bar shows the shortcut on each tab.
- When Claude Code finishes (`status: 'done'`) in a workspace that is **not** active, increment `unread`: the tab gets a counter (the background does not change) and the dot pings once. If a session is still running in the workspace, the tab keeps the neon trace along with the counter. When the tab is selected, reset `unread` and set the status back to `idle`.
- Do not show a counter on the active workspace; fire a `Toast` instead.
- New tabs enter with `duration-base` + `ease-out` (rise 4px and appear).

**Don't**

- Do not use color alone for status: the dot has an `aria-label`, and the counter goes with it.
- The gradient border belongs to the active tab; the neon trace is only for tabs with Claude `running`. Do not use neon for any other meaning in the bar.
