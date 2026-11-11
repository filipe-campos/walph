# StatusBar

The 28px bar at the bottom of the window, below everything and full width: git state on the left, open file state on the right.

**The consumer provides:** `path` (project path on the computer, e.g. `~/code/clientes/billing-api`), `branch`, `ahead` / `behind` (commits to push / pull relative to `upstream`, default `origin/<branch>`), `syncing`, `lastCommit` (`author`, relative `time` such as "há 2 h", `message`, `hash`), `line`, `column`, `selection`, `encoding` ("UTF-8"), `eol` ("LF" | "CRLF"), `language` ("TypeScript") and, optionally, `indent`, `left` / `right` for extra items. Each item with a handler becomes a button: `onPath` (e.g. reveal in Finder or copy), `onBranch`, `onSync`, `onCommit`, `onGoToLine`, `onEncoding`, `onEol`, `onLanguage`.

- Background `bg-000` with a `line` hairline on top; 12px text in `ink-muted`. Item hover: `bg-300` and `ink`.
- **Project path** first, with the `folder` icon, in 11px mono: parent folders in `ink-faint` and the project folder in `ink-muted`. A long path is cut from the start, never at the project name; the full path is in the tooltip.
- **Branch** in `ink` with the `branch` icon in `accent`.
- **Sync:** ↓ pull and ↑ push, in 11px mono. The side with commits is in `ink` with an `accent` arrow; at zero, in `ink-faint`. While `syncing`, the arrows breathe (`duration-pulse`). The tooltip explains: "2 commits para enviar · 1 commit para receber (origin/feat/x)".
- **Last commit:** author initials in an `accent-soft` circle, "Ana Souza, há 2 h" and the message in `ink-faint`; hash and full message in the tooltip.
- **Cursor:** "Ln 42, Col 18" with tabular numbers; with a selection, "(12 selecionados)".
- **Encoding, line ending and file type** on the right; the type carries `{ }` in `accent` mono.
- Responsive to its own width: the path becomes just the project folder and the commit message disappears (≤900px), then indentation and encoding (≤720px), the author (≤680px, the avatar stays; with a path, the whole commit goes), the path (≤640px), the line ending (≤560px) and, last, the commit (≤440px). Branch, sync and cursor always stay.
