# WorkspaceTab

A workspace tab with name, branch (with the `branch` icon) and the Claude Code status; usually rendered by `WorkspaceBar`. Every tab has the same size, 204×42px, in any status: name and branch shrink with ellipsis, and counter, shortcut and "x" take the right side.

**Claude Code states (`status`)**

| status | dot | motion | when |
| --- | --- | --- | --- |
| `idle` | `ink-faint` | - | nothing running |
| `running` | `accent` | continuous breathing (`duration-pulse`, `ease-breathe`) | agent working |
| `done` | `success` | single ping on entering the state | agent finished |
| `attention` | `warning` | continuous pulse (`duration-pulse`); the tab gets a `warning` border with a pulsing glow (the active tab's gradient ring goes away) | waiting for permission or an answer |
| `error` | `danger` | single ping | failed |

**Border:** inactive, idle tabs have a thin 0.5px outline in `ink-faint` at 50% opacity (`ink-muted` at 50% on hover). **Selected tab:** full 2px gradient border (`accent-3` → `accent` → `accent-2`, without the faded segment of `--grad-ring`), `bg-300` background tinted with 14% `accent`, an `accent-glow` glow around it, name in 600 `ink` and branch in `ink-muted`, so the active tab can be found at a glance, even next to running tabs. While `running`, the neon line runs around the tab border (`.wp-neon-live`), so you can see from afar which workspaces have Claude working.

`unread > 0` on an inactive tab shows a counter in the status color (`on-accent` text) and sets the name in `ink`; **the background does not change**. The counter pulses until read: a halo of the same color expands 6px and fades every `duration-pulse`. The "x" appears on hover and on the active tab (`duration-fast`).

**Shortcut:** `⌘1`…`⌘9` on a compact 17px tall key (`bg-200`, `line` outline, 4px corners): the `⌘` is the `command` icon and the number is Geist 11px, both with the same visual height (8px) and centered on the key's axis. Name (12/16) and branch (11/14) have 3px between them.

**Notification + running:** a workspace can have news (`unread`) and still have Claude running, for example one session finished and another continues. The tab combines both: an `accent` counter and the neon line running around the border. The dot follows the most urgent status among the sessions (see README: Claude Code notifications).
