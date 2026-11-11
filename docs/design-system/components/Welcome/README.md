# Welcome

The welcome screen, shown when no workspace is open (or in a new tab with `⌘T`): start actions, a field to start directly with Claude Code and the recent workspaces, which can be opened several at once.

**The consumer provides:** `recent` (list of `Workspace` with `path`, `branch`, `lastOpened` and optional `status`), `onOpen(ids)` (always receives a list), `onOpenFolder`, `onClone`, `onTerminal`, `onAsk(prompt)` (creates a new workspace and hands the request to Claude) and optional `tagline`.

- Recents: a click opens one; `Space` or `⌘click` selects several; the button becomes "Abrir N workspaces" (primary). With no selection, "Abrir todos" restores the whole session in `WorkspaceBar`.
- A workspace that Claude finished or that asks for something shows the status dot next to its name.
- Staggered entrance: each block rises 4px and appears in `duration-base` + `ease-out`, with `duration-stagger` (40ms) between blocks: 5 steps, ~380ms in total.
- The full logo (`Logo`, 52px) opens the screen; it is the only display moment in the IDE.
- **Light:** `--grad-aurora` background (three diffuse halos); the "Comece com o Claude" field always has the neon line running, as an invitation; checked checkbox in `--grad-brand`.
- Hover on the actions: the icon slides 2px to the right (`duration-fast`).
