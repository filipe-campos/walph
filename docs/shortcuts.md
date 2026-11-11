# Keyboard shortcuts and feature reference

The Walph UI is available in Brazilian Portuguese, English and Spanish. Command, menu and button labels below are
quoted exactly as they appear in the English UI (for example **Git: Switch Branch…**), so you can type them into the
command palette.

Every action in Walph is a registered command. The command palette (⌘⇧P / Ctrl+Shift+P) lists them all with category
and shortcut, with fuzzy search and the recently used ones on top. The native menu and the palette always show the
effective shortcut, including your own overrides from `keybindings.json`.

## Shortcuts

"(in the panel)", "(in the editor)" and similar notes mean the shortcut only fires when that area has focus; outside
it the same key does something else or reaches the focused widget.

### General

| Action                                                                 | macOS        | Windows / Linux                                 |
| ---------------------------------------------------------------------- | ------------ | ----------------------------------------------- |
| Unified palette (workspaces, commands, files, **Ask Claude**)          | ⌘K           | none by default (bind it in `keybindings.json`) |
| Command palette                                                        | ⌘⇧P          | Ctrl+Shift+P                                    |
| Go to file (Quick Open)                                                | ⌘P           | Ctrl+P                                          |
| Go to line                                                             | ⌃G           | Ctrl+G                                          |
| Open folder as a new workspace                                         | ⌘O           | Ctrl+O                                          |
| Clone repository                                                       | ⌥⌘O          | Ctrl+Shift+Alt+O                                |
| Go to workspace 1…9                                                    | ⌘1…⌘9        | Ctrl+1…9                                        |
| Next / previous workspace (outside the Claude panel)                   | ⌃⇥ / ⌃⇧⇥     | Ctrl+Tab / Ctrl+Shift+Tab                       |
| New window                                                             | ⌘⇧N          | Ctrl+Shift+N                                    |
| Close window                                                           | ⌘⇧W          | (closing the window quits)                      |
| Quit                                                                   | ⌘Q           | Ctrl+Q (Linux), Alt+F4 (Windows)                |
| Open settings                                                          | ⌘,           | Ctrl+,                                          |
| Default zoom / zoom in / zoom out                                      | ⌘0 / ⌘+ / ⌘- | Ctrl+0 / Ctrl++ / Ctrl+-                        |
| Full screen                                                            | ⌃⌘F          | F11                                             |

### Files, tabs and editor

| Action                                                                                                  | macOS        | Windows / Linux                |
| ------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------ |
| Save                                                                                                    | ⌘S           | Ctrl+S                         |
| Save all                                                                                                | ⌥⌘S          | Ctrl+K S (not in the terminal) |
| Close tab (outside the Claude panel)                                                                    | ⌘W           | Ctrl+W                         |
| Reopen closed tab                                                                                       | ⇧⌘T          | Ctrl+Shift+T                   |
| Find in file                                                                                            | ⌘F           | Ctrl+F                         |
| Split editor (outside the terminal)                                                                     | ⌘\\          | Ctrl+\\                        |
| Split editor down (outside the terminal)                                                                | ⌥⌘\\         | Ctrl+K Ctrl+\\                 |
| Focus the 1st…8th editor group (outside the terminal)                                                   | ⌃1…⌃8        | Alt+1…Alt+8                    |
| Focus the editor group to the left / right / above / below (outside the terminal)                       | (palette)    | Ctrl+K Ctrl+←/→/↑/↓            |
| Move the editor into the next / previous group (outside the terminal)                                   | ⌃⌘→ / ⌃⌘←    | Ctrl+Alt+→ / Ctrl+Alt+←        |
| Compare the active file with the saved one (outside the terminal)                                       | (palette)    | Ctrl+K D                       |
| Markdown preview to the side (in the editor on `.md`/`.mdx`; in the preview it goes back to the source) | ⇧⌘V          | Ctrl+Shift+V                   |
| Copy / cut / paste file (in the explorer)                                                               | ⌘C / ⌘X / ⌘V | Ctrl+C / Ctrl+X / Ctrl+V       |

### Views and panels

| Action                        | macOS           | Windows / Linux             |
| ----------------------------- | --------------- | --------------------------- |
| Explorer / Search / Git       | ⌘⇧E / ⌘⇧F / ⌃⇧G | Ctrl+Shift+E / F / G        |
| Containers (Docker)           | ⌘⇧D             | Ctrl+Shift+D                |
| Toggle sidebar                | ⌘B              | Ctrl+B                      |
| Problems / Output             | ⌘⇧M / ⌘⇧U       | Ctrl+Shift+M / Ctrl+Shift+U |
| Replace in files              | ⌘⇧H             | Ctrl+Shift+H                |
| Next / previous search result | F4 / ⇧F4        | F4 / Shift+F4               |

### Terminal

| Action                                         | macOS      | Windows / Linux         |
| ---------------------------------------------- | ---------- | ----------------------- |
| Toggle terminal / new terminal                 | ⌃\` / ⌃⇧\` | Ctrl+\` / Ctrl+Shift+\` |
| Find in terminal (in the terminal)             | ⌘F         | Ctrl+F                  |
| Split terminal (in the terminal)               | ⌘\\        | Ctrl+Shift+5            |
| Open terminal link (URL or `file:line:column`) | ⌘-click    | Ctrl-click              |

### Code (language server)

These fire only with the editor focused.

| Action                                        | macOS                   | Windows / Linux                             |
| --------------------------------------------- | ----------------------- | ------------------------------------------- |
| Go to definition / references                 | F12 (or ⌘-click) / ⇧F12 | F12 (or Ctrl-click) / Shift+F12             |
| Rename symbol                                 | F2                      | F2                                          |
| Format document                               | ⇧⌥F                     | Shift+Alt+F                                 |
| Quick fix (code actions)                      | ⌘.                      | Ctrl+.                                      |
| Suggestions (autocomplete)                    | ⌃Space                  | Ctrl+Space                                  |
| Next / previous problem in file               | F8 / ⇧F8                | F8 / Shift+F8                               |
| Next / previous symbol highlight              | F7 / ⇧F7                | F7 / Shift+F7                               |
| Symbol in file / in workspace                 | ⌘⇧O / ⌘T                | Ctrl+Shift+O / Ctrl+T (not in the terminal) |
| Focus breadcrumbs (opens the last segment)    | ⌘⇧.                     | Ctrl+Shift+.                                |
| Navigate back / forward (not in the terminal) | ⌃- / ⌃⇧-                | Alt+← / Alt+→                               |

### Debugger

Start, Run without debugging and Toggle breakpoint work without a session; the others only while one is running.

| Action                                   | macOS         | Windows / Linux |
| ---------------------------------------- | ------------- | --------------- |
| Start debugging / continue               | F5            | F5              |
| Run without debugging                    | ⌃F5           | Ctrl+F5         |
| Stop / restart                           | ⇧F5 / ⇧⌘F5    | Shift+F5 / Ctrl+Shift+F5 |
| Pause                                    | F6            | F6              |
| Step over / into / out                   | F10 / F11 / ⇧F11 | F10 / F11 / Shift+F11 |
| Toggle breakpoint (in the editor)        | F9            | F9              |
| Debug Console                            | ⇧⌘Y           | Ctrl+Shift+Y    |

On Windows/Linux F11 is full screen only while no debug session is running.

### Claude Code panel

| Action                                           | macOS    | Windows / Linux                          |
| ------------------------------------------------ | -------- | ---------------------------------------- |
| **Claude: Open/Focus**                           | ⌘L or ⌘⎋ | Ctrl+L (not in the terminal) or Ctrl+Esc |
| **Claude: New Conversation**                     | ⇧⌘L      | Ctrl+Shift+L                             |
| Next / previous session (in the panel)           | ⌃⇥ / ⌃⇧⇥ | Ctrl+Tab / Ctrl+Shift+Tab                |
| **Claude: Find in Session** (in the panel)       | ⌘F       | Ctrl+F                                   |
| **Claude: Close Session** (in the panel)         | ⌘W       | Ctrl+W                                   |
| **Claude: Rename Session** (in the panel)        | F2       | F2                                       |
| **Claude: Insert Reference** (in the editor)     | ⌥K       | Alt+K                                    |
| Cycle permission mode (in the Claude prompt box) | ⇧⇥       | Shift+Tab                                |

## Palettes

**Unified palette (⌘K).** Searches the window's **Workspaces** (with each one's Claude status; Enter activates it),
**Commands** and **Files** at once. The last row of any search is **Ask Claude**: it opens the panel,
creates a new session and sends what you typed. The prefixes (`>`, `:`, `@`, `#`) switch modes like in Quick Open.

**Quick Open (⌘P).** Finds project files by name (fuzzy on the relative path, favoring the file name; respects
`.gitignore` and includes hidden files). With an empty query it shows open and recent files. Prefixes, as in VS Code:
`>` turns it into the command palette, `:` goes to a line in the current file (`:42` or `:42:7`), `@` lists the
file's symbols and `#` the workspace's. A `:line[:column]` suffix on the name opens the file at that position
(`App.tsx:42`).

## Editor and tabs

- **Never lose work:** closing a tab, several tabs, the window or the app with unsaved changes asks
  "Save / Don't Save / Cancel" in a native dialog.
- **Changes on disk:** a clean tab reloads by itself; a dirty tab shows the conflict bar ("Reload from Disk" /
  "Keep My Version"). A file deleted outside the editor leaves the tab struck through, and saving recreates it.
- **Preview tabs:** a single click in the explorer or search opens the file in italics, replaced by the next preview;
  editing it or double clicking (in the explorer or on the tab) pins it.
- **Tabs:** context menu (Close, Close Others, Close to the Right, Close Saved, Copy Path, Reveal in
  Explorer View) and drag to reorder.
- **Images:** image files (PNG, JPEG, GIF, WebP, SVG, BMP, ICO, AVIF) open in an image viewer tab.
- **Status bar:** line ending (LF/CRLF) and indentation (Spaces: N / Tabs) are detected from the file; saving keeps
  the original line ending and Tab uses the file's indentation. Everything is clickable: the project path (with `~`)
  offers "Reveal in Finder/Explorer" / "Copy path"; the last commit (initials, author, relative time and
  message; full hash and message in the tooltip) opens it in the history; the cursor shows the selection
  ("(12 selected)") and opens Go to Line; the line ending toggles LF/CRLF (dirties the tab); the indentation
  switches spaces/tabs and size, converting existing indentation only on request; the language opens the mode picker
  (stored in the session). Sync shows separate ↓/↑ counts with arrows that "breathe" while syncing. The bar adapts to
  its own width: the commit message goes first, then indentation/encoding, author, path, line ending and the commit;
  branch, sync and cursor always stay.
- **Encoding:** UTF-8 with BOM and UTF-16 LE/BE are detected by the BOM and kept on save. From the status bar (or
  **Editor: Reopen or Save with Encoding…**) you can reopen or save with UTF-8, UTF-8 with BOM, UTF-16 LE/BE,
  Windows-1252 or ISO-8859-1. The choice is stored in the session. Without a BOM there is no heuristic detection, and
  search replace still refuses files that are not UTF-8.
- **Split editor (⌘\\ / Ctrl+\\; down with ⌥⌘\\ / Ctrl+K Ctrl+\\ or Alt+click on the split button):** up to
  eight groups in a grid of splits (each group keeps a live editor, and ⌃1…⌃8 / Alt+1…8 reach all of them), each with
  its own tabs and active tab. The same tab can live in several groups and shares the document (typing in one shows in
  the others, one undo history, one `didChange` for the language server). Drag a tab to another group's tab strip or
  body; dropping it near an edge of a group's body splits that group on that side. **View > Editor Layout** has split
  right/down, focus next/left/right/above/below group, move editor into the next/previous group, join all groups and
  close group; closing a group's last tab closes the group. Every divider is draggable and the grid comes back with the
  session (sessions from before the grid open as groups side by side).
- **Compare files:** **Select for Compare** and **Compare with Selected** in the explorer and tab context menus,
  **Compare Active File with Saved** (disk on the left, the unsaved buffer on the right) and **Compare Active File
  With…** (file picker) open the side-by-side diff. A side that is open in a tab follows its buffer; the header has
  **Swap Comparison Sides**. Comparisons are not restored with the session.
- **Markdown preview (⇧⌘V / Ctrl+Shift+V):** on `.md`/`.mdx` it opens the preview in the other group, following what
  you type (not the disk). Relative links open the file in the editor, `http(s)`/`mailto` open in the browser and local
  images from the folder are shown; the HTML is sanitized (no scripts, iframes or `on*` handlers) and remote images are
  not loaded.

## Explorer

- **Explorer: Copy File**, **Explorer: Cut File**, paste and **Explorer: Duplicate File**, with
  ⌘C / ⌘X / ⌘V (Ctrl+C / Ctrl+X / Ctrl+V) while the tree has focus. Drag entries to move them. Deleted files go to the
  trash.

## Sessions, recent folders and windows

- **Session per folder:** tabs (order, active tab, preview), each tab's cursor and top line, expanded folders, sidebar
  view, terminal and panel sizes are saved in `<userData>/sessions/<path-hash>.json` and restored when you reopen the
  folder. Restored tabs only read the file when shown; files that disappeared are skipped.
- **Welcome screen:** with no folder open, it lists recent folders with branch, "opened X ago" and the Claude status
  when the folder is open in another workspace (click opens, × removes). ⌘-click / Ctrl-click or Space selects several
  and the button becomes "Open N Workspaces"; with no selection, "Open All" reopens the window's last workspaces
  (or the recent ones, up to 9). Actions: Open Folder (⌘O), Clone Repository (⌥⌘O), Terminal (⌃\` on the home
  screen) and New Window. "Start with Claude": type a request and Enter opens the selected recent folder (or asks
  for a folder, with "New Folder") with a session already working on it. Recent folders are also in
  **File › Open Recent** (native menu) and **File: Open Recent…** in the palette, plus
  **File: Clear Recent Folders**.
- **Several workspaces in one window:** the workspace bar at the top has one tab per folder (name, branch, Claude Code
  status and unread counter, shortcut ⌘1…⌘9 / Ctrl+1…9, "x" to close, "+" to open another folder, drag to reorder).
  Each workspace has its own explorer, terminals, git, LSP and Claude; switching loses nothing. ⌘O / Ctrl+O
  (**File: Open Folder as Workspace…**) opens a folder as a new workspace; **File: Open Folder in This
  Workspace…** replaces the current one's folder. When Claude finishes, asks for something or fails in an inactive
  workspace, its tab gets a counter and the active view shows a toast with the source card and "Open Workspace".
  Closing a workspace asks only about its own unsaved files and stops only its processes; closing the last one leaves
  the welcome screen. Restored workspaces stay dormant until first activated, and inactive workspaces hibernate after
  a while to save memory (`workspaces.maxLiveViews`, `workspaces.hibernateAfterMinutes`).
- **Several windows:** **File: New Window** (⌘⇧N / Ctrl+Shift+N). Opening a folder that is already open elsewhere
  focuses it. When the app reopens without a folder argument, every window of the last session comes back (with
  position and size), each with its workspaces, tabs and cursors. Quitting with unsaved files in several windows asks
  window by window before closing any; cancelling keeps all of them open.

## Git

- **Branches:** clicking the branch in the status bar (or **Git: Switch Branch…**) lists local and remote branches
  and checks one out; **Git: Create Branch…** creates one from the current branch. Picking a remote branch creates a
  local one tracking it.
- **Gutter:** added / modified / removed line marks relative to the index, updated as you type; they disappear once
  staged.
- **Discard:** per file or everything (the "Changes" header or **Git: Discard All Changes**), always with
  confirmation; untracked files go to the trash.
- **Commit:** the "Amend" checkbox (or **Git: Commit (Amend)**) prefills the last commit's message and lets you change
  only the message; **Git: Undo Last Commit** runs `reset --soft HEAD~1` and puts the message back in the box.
- **History:** a section in the Git view (or **Git: Show History**) with a paginated `git log` (hash, author,
  relative date, message); clicking a commit lists its files and clicking a file opens a read-only diff.
- **Stash:** a "Stashes" section (apply, apply and drop, drop) and the commands **Git: Stash Changes…**,
  **Git: Apply Stash…**, **Git: Pop Stash…** and **Git: Drop Stash…**.
- **Pull / Push / Sync** (**Git: Pull**, **Git: Push**, **Git: Sync**): progress in the status bar and in the
  view; without an upstream the status bar shows "Publish Branch" (`push -u origin <branch>`). Walph never prompts for
  credentials: an authentication error tells you to run the command in the integrated terminal.
- **Clone** (**Git: Clone Repository…**, ⌥⌘O / Ctrl+Shift+Alt+O, or from the welcome screen): `https://`, `ssh://`
  or `git@host:path` URLs (rejects `-…`, `ext::`, `file://` and local paths), destination folder from a dialog,
  progress in a toast with "Cancel" (kills git and deletes the partial folder), then opens it as a new workspace.

## Search and replace

- **Global search (⌘⇧F):** ripgrep over the workspace folder, with case, whole word and regex toggles. With a single
  line selected in the editor, ⌘⇧F prefills the query. Typing again cancels the previous search (the running `rg` is
  stopped).
- **Filters:** "…" shows "files to include" and "files to exclude" (comma separated globs: `*.ts, src/**`; without
  `/` they match at any depth, `./x` anchors at the root). `.gitignore`, `files.exclude` and `search.exclude` always
  apply.
- **Replace (⌘⇧H):** results show a preview (struck through text → new text); replace one match, one file or all
  ("Replace All" confirms with the count). In regex mode `$1`, `$<name>`, `$&` and `$$` work. Only the matches
  shown change: if a line changed since the search, that match is skipped with a warning. Tabs with unsaved changes get
  the replacement in the editor (undoable with ⌘Z) instead of on disk; files that are not UTF-8 are never touched.
- **Navigate:** F4 / ⇧F4 step through the results, opening each one; collapse/expand all and clear are in the title.

## Languages (LSP) and problems

- **TypeScript/JavaScript built in:** opening a `.ts`/`.tsx`/`.js`/`.jsx`/`.mts`/`.cts`/`.mjs`/`.cjs` file starts the
  workspace's `typescript-language-server` (with the bundled tsserver). Errors and warnings are underlined in the
  editor (hover to read them) and listed in the **Problems** panel (⌘⇧M), grouped by file; clicking navigates.
- **Status bar:** an error/warning counter (opens Problems) and the state of the active file's server (starting /
  ready / error). If a server crashes it restarts by itself (up to 5 attempts); **Language: Restart Language
  Server** restarts it right away. Server logs are in the **Output** panel (⌘⇧U).
- **`lsp.servers`** (user settings only, because it runs programs):
  `{ "pyright": { "command": "pyright-langserver", "args": ["--stdio"], "extensions": [".py"], "languageId": "python" } }`.
  `"typescript": { "enabled": false }` turns the built-in server off; `"useWorkspaceTypeScript": true` uses the
  project's `node_modules/typescript` (never used without this option, since it would run code from the repository).
  On Windows, point to the real executable (`.cmd` shims do not run without a shell).
- Closing the folder, reloading or closing the window stops its servers (including child processes).
- **Autocomplete:** server suggestions as you type (and on trigger characters such as `.`), with a kind icon,
  documentation on the side and auto import; snippets with Tab-navigable placeholders.
- **Hover and signature:** hovering shows the type and documentation (markdown); typing `(` shows the signature with
  the current parameter highlighted (Esc closes).
- **Navigation:** F12 / ⌘-click goes to the definition (several go to the **References** panel); ⇧F12 lists
  references grouped by file; back/forward (⌃- / ⌃⇧-; Alt+←/→ on Windows/Linux) walk the jump history.
- **Rename (F2):** applies across all files. Loaded tabs get the edit in their buffer (dirty, one undo per file); other
  files are rewritten on disk keeping their line ending. Nothing is applied if any file changed since the request.
- **Format and code actions:** ⇧⌥F formats through the server with the tab's indentation; `editor.formatOnSave`
  formats on manual save (not on auto save). A light bulb in the gutter marks available fixes; ⌘. opens the menu.
- **Inlay hints, occurrences and semantic colors:** inlay hints (inferred types, parameter names) appear inline for the
  visible part of the file (`editor.inlayHints.enabled`); resting the cursor on a symbol highlights its occurrences
  (writes and reads in different tones), and F7 / ⇧F7 walk them (whole-word matches without a server); semantic
  tokens color the code on top of the syntax highlighting (`editor.semanticHighlighting.enabled`).

## Debugger (Debug Adapter Protocol)

- **Run and Debug** (activity bar, or **Run** menu): pick a configuration from `.vscode/launch.json` (JSONC, the
  VS Code format, with `windows`/`osx`/`linux` overrides) and start with F5. Without a `launch.json` Walph offers
  "Python: Current File" and "Node.js: Current File"; the gear creates the file from them. Supported variables:
  `${workspaceFolder}`, `${workspaceFolderBasename}`, `${file}`, `${relativeFile}`, `${relativeFileDirname}`,
  `${fileBasename}`, `${fileBasenameNoExtension}`, `${fileExtname}`, `${fileDirname}`, `${lineNumber}`,
  `${selectedText}`, `${userHome}`, `${pathSeparator}`, `${env:NAME}`. `${command:…}`/`${input:…}` and tasks
  (`preLaunchTask`) are not supported (tasks are skipped with a note in the Debug Console).
- **Adapters** come from `debug.adapters` (user settings only, because it runs programs), keyed by the configuration
  `type`. Python works out of the box with `python3 -m debugpy.adapter` (`pip install debugpy`), or reuse the copy in
  the VS Code extension by pointing `PYTHONPATH` at its `bundled/libs` folder:
  `"python": { "command": "python3", "args": ["-m", "debugpy.adapter"], "env": { "PYTHONPATH": "/Users/me/.vscode/extensions/ms-python.debugpy-<version>/bundled/libs" } }`.
  Node (`node`/`pwa-node`) uses the standalone js-debug server (`js-debug-dap-<version>.tar.gz` from the
  vscode-js-debug releases):
  `"node": { "command": "node", "args": ["/path/to/js-debug/src/dapDebugServer.js", "${port}", "127.0.0.1"], "transport": "tcp" }`
  (`${port}` becomes a free local port; js-debug's child sessions open their own connections).
- **Breakpoints:** click left of the line numbers (or F9) to toggle; right-click for a conditional breakpoint, hit count
  or logpoint. They follow edits, are saved with the workspace and are listed in the Breakpoints section (enable,
  edit the condition, remove).
- **While paused:** the current line is highlighted and its file revealed; Variables (expandable), Watch and Call Stack
  update for the selected frame. The floating toolbar continues, steps, restarts and stops; the Debug Console
  (⇧⌘Y) shows the program output and evaluates expressions in the selected frame.
- Programs launched with `"console": "integratedTerminal"` run in a Walph terminal. Stopping, reloading or closing the
  workspace ends the sessions and kills the adapters.

## Terminal

- **Rendering:** WebGL (`terminal.gpuAcceleration: "auto"`), falling back to the DOM renderer if the context fails;
  `htop`, `vim` and friends resize with the panel.
- **Links:** URLs (including OSC 8 hyperlinks) open in the browser, and paths like `src/a.ts:12:5` or `src/a.ts(12,5)`
  (`tsc` output) open in the editor at that line, with ⌘/Ctrl-click. Relative paths are resolved against the shell's
  current directory, the workspace folder or the starting directory.
- **Find:** ⌘F with the terminal focused (case, regex, previous/next with Enter/⇧Enter, Esc closes).
- **Split and tabs:** **Terminal: Split Terminal** puts terminals side by side in the same tab, each with its own
  input; the title follows the foreground process (`zsh` → `vim`) and **Terminal: Rename Terminal…** (or double
  clicking the tab) pins a name. **Terminal: Kill Terminal** kills the active one.
- **Profiles:** `"terminal.profiles": { "Bash": { "path": "/bin/bash", "args": ["-l"], "env": { "FOO": "1" } } }`; the
  arrow next to "+" (or **Terminal: New Terminal with Profile…**) picks a profile, and `terminal.defaultProfile` sets
  the one used by "+".
- **Panel:** **View: Maximize/Restore Panel** and **View: Move Panel (Bottom/Right)** (the position is stored
  in the session); `terminal.copyOnSelection` copies on select and `terminal.fontSize` applies immediately.

## Containers (Docker)

- **Its own screen** (⌘⇧D or the activity bar icon): it takes over the layout until you pick another view; editor,
  terminal and Claude stay open underneath. The icon shows how many containers have a problem.
- **List:** Docker context and version, search by name/image/port, an All/Running/Stopped filter, four summary cards
  and containers grouped by compose project ("3/4 running", projects from the open folder first), with CPU (sparkline),
  memory, ports (web ports open `http://localhost:<port>`), uptime and actions (start, stop, restart, logs, terminal).
  Groups have Compose up / Restart / Stop; the header runs Compose up on the folder's `compose.yaml`.
- **Detail:** Logs tab (following, with levels) and Details tab (inspect, without environment variable values);
  **Terminal** opens `docker exec -it <id> sh` in the terminal panel.
- **Problems** (`unhealthy` or restart loop): a card with **Investigate with Claude**, which opens a session with the
  last log lines and the inspect output as context.
- `docker.path` (user settings only) picks the executable (`docker` or a compatible one such as `podman`); empty means
  `docker` from the login shell PATH. Without Docker, or with the daemon stopped, the screen explains and offers to try
  again.

## Claude Code panel

- **Secondary sidebar** on the right (resizable; visibility and width are stored in the session), opened by
  **Claude: Open/Focus** (⌘L / ⌘⎋, Ctrl+L / Ctrl+Esc), the ✦ icon on the tab bar or **View: Toggle Secondary
  Sidebar**. It runs Claude Code through the Claude Agent SDK with your own login (`~/.claude`, `CLAUDE.md`, skills,
  MCP and project hooks), with the workspace folder as its directory. Without a login, the panel offers to open a
  terminal running `claude`.
- **Conversation:** streaming answers with markdown, reasoning and tools in collapsible rows, paths that open in the
  editor. Esc (or the button) interrupts; messages sent while Claude works are queued.
- **Prompt box:** `@` searches files/folders (`@file#L10-20`), the active file and selection go as context (with a
  button to turn it off), **Claude: Insert Reference** (⌥K / Alt+K), image paste, ↑ recalls previous messages. The
  paperclip (native dialog) and dragging files into the box create chips with name, size and "x" (images become
  thumbnails); a file from outside the folder asks for confirmation. The `/` button (or `/` in an empty box) opens the
  command menu grouped into Project (`.claude/commands`), Personal (`~/.claude/commands`) and Claude Code, with the
  expected argument and description.
- **Mode, model and effort:** chips in the box. The mode menu (Manual, Edit automatically, Plan, Auto, Bypass
  permissions; ⇧⇥ cycles the enabled ones) and model plus effort ("Opus ▁▃▅▇█ high": `auto`,
  `low`, `medium`, `high`, `xhigh`, `max`; ← → move the level; `max` applies to the session only). "Bypass
  permissions" only shows up with `claude.allowBypassPermissions: true` in user settings and paints the box coral.
- **Edits and permissions:** in "Manual" each edit opens a side by side diff with Accept /
  Reject (the reason goes back to Claude; a dirty tab asks to save first). "Edit automatically" applies directly
  and "Plan" shows the plan for approval before running. Bash, web and MCP ask inline: Allow / Always
  Allow (this session) / Always in This Workspace (writes the rule to the folder's `.claude/settings.local.json`, kept
  out of git through `.git/info/exclude`) / Deny with a comment.
- **Claude's questions:** when it needs a decision, Claude asks in a card at the end of the conversation (one or more
  questions, single or multiple choice and "Other" with free text). Numbers 1 to 9 pick, ← → switch questions, Enter on
  "Other" moves on or answers; "x" skips and Claude decides on its own. Works in any permission mode; with the session
  out of view, its tab shows "needs you" and the toast says "Claude Code has a question".
- **IDE tools:** Claude reads the Problems diagnostics, the current file and selection and the open tabs, and can
  propose a diff (`openDiff`).
- **Conversations:** tabs in the panel, the folder's conversation history (searchable) to resume, and checkpoints to
  roll code and/or conversation back to an earlier message. The bar shows context usage (`/compact`) and cost.
- **Sessions:** the star favorites the active session (favorites come first in the history) and the **⋯** menu has
  Rename (F2 with the panel focused, or double click the tab), Duplicate, Export Conversation (.md), Compact Context
  and Close Session. ⌘F / Ctrl+F in the panel searches the session text. The last message you sent stays pinned at
  the top while the answer scrolls (click it to jump back).
- **MCP servers:** **Claude: Manage MCP Servers** (also `/mcp` in the prompt and the **⋯** menu) manages the
  session's MCP servers.
- **Summary and agents:** at the end of each turn a summary lists the changed files, `+N −N` and "Review" (opens the
  git diff); running subagents show up in the "Agents" strip above the box, with each one's task and elapsed time.
- **Status and notifications:** each conversation tab has a status dot (working, done, needs you, failed) and an unread
  counter. When a session you are not looking at finishes, asks for permission or fails, a toast appears in the bottom
  right corner ("Open Session", and "Review" on requests); with the window unfocused an OS notification arrives too,
  and the app icon shows the total unread count (macOS/Linux).

## Settings, themes and keybindings

- **Settings screen:** ⌘, / Ctrl+, (or the gear at the bottom of the activity bar) opens Settings with the
  sections Editor, Files, Terminal, Claude Code, Appearance and Shortcuts (a read-only list with "Edit
  keybindings.json"). Each control saves immediately, keeping the file's comments. The **User / Workspace** scope
  picks the file; user-only keys are disabled in Workspace with an explanation, a value overridden by the workspace
  shows "set in the workspace" with "Restore", and "Restore default" removes the key from the user `settings.json`.
  Complex keys (profiles, LSP servers, `claude.env`, excludes) show a summary and "Edit in settings.json".
- **`settings.json`:** **Preferences: Open Settings (JSON)** opens `<userData>/settings.json` in the editor;
  **Preferences: Open Workspace Settings (JSON)** opens `<folder>/.walph/settings.json`, which overrides the
  user file. Comments and trailing commas are accepted (JSONC). Saving applies immediately; a syntax error shows a
  warning and keeps the last valid configuration.
- **Keys:**
  - Editor: `editor.fontSize`, `editor.fontFamily`, `editor.tabSize`, `editor.insertSpaces` (used when the file has no
    detectable indentation), `editor.wordWrap`, `editor.lineNumbers`, `editor.minimap`, `editor.formatOnSave`,
    `editor.inlayHints.enabled` (`on` / `off`), `editor.semanticHighlighting.enabled`.
  - Files and search: `files.autoSave` (`off` / `afterDelay` / `onFocusChange`), `files.autoSaveDelay`,
    `files.exclude` (hides from the explorer, Quick Open and search), `files.watcherExclude`, `search.exclude` (search
    only; defaults to `node_modules` and `bower_components`).
  - Terminal: `terminal.fontSize`, `terminal.scrollback`, `terminal.copyOnSelection`, `terminal.gpuAcceleration`
    (`auto` / `off`), `terminal.shell`, `terminal.profiles`, `terminal.defaultProfile`.
  - Appearance: `workbench.theme`, `workbench.fontFamily`, `workbench.fontSize`.
  - Languages: `lsp.servers`.
  - Claude: `claude.model`, `claude.fallbackModel`, `claude.effort`, `claude.initialPermissionMode`,
    `claude.allowBypassPermissions`, `claude.autoContext`, `claude.executable`, `claude.env`,
    `claude.notifications.toast` (`all` / `attention` / `off`), `claude.notifications.system`,
    `claude.notifications.sound`, `claude.idleSleepMinutes`.
  - Other: `docker.path`, `workspaces.maxLiveViews`, `workspaces.hibernateAfterMinutes`, `update.enabled`,
    `update.channel` (`stable` / `beta`).
  - User settings only (a repository cannot set them): `terminal.shell`, `terminal.profiles`,
    `terminal.defaultProfile`, `lsp.servers`, `claude.initialPermissionMode`, `claude.allowBypassPermissions`,
    `claude.fallbackModel`, `claude.executable`, `claude.env`, `claude.idleSleepMinutes`, `docker.path`,
    `workspaces.maxLiveViews`, `workspaces.hibernateAfterMinutes`, `update.enabled`, `update.channel`.
- **Themes:** **Preferences: Select Theme…** previews as you move with the arrows (Esc reverts); UI, editor and
  terminal change together. Built in: Walph Dark and Walph Light. If the workspace sets the theme, the choice is saved
  there.
- **Keybindings:** **Preferences: Open Keyboard Shortcuts (JSON)** opens `<userData>/keybindings.json`, in the VS
  Code format: `[{ "key": "cmd+alt+t", "command": "workbench.selectTheme", "when": "!terminalFocus" }]`.
  `"command": "-<id>"` removes a command's shortcuts (with `"key"`, only that one). `when` accepts `terminalFocus`,
  `editorFocus`, `claudeFocus`, `markdownPreviewFocus`, `explorerFocus`, `!`, `&&` and `||`. A command can have
  several shortcuts: the user's first entry replaces its defaults and the following ones add to them (the menu shows
  the first). A key assigned to another command moves to the new one, unless the `when` clauses are disjoint (for
  example ⌘W closes the session in the Claude panel and the tab outside it). Chords (`Ctrl+K S`) are supported. On
  Windows/Linux, `Ctrl+K S` (Save All) does not fire with the terminal focused, so `Ctrl+K` reaches the shell.

## Updates and the `walph` command

- **Auto update:** installed builds check GitHub Releases on startup and every 4 hours (`update.enabled`,
  `update.channel`: `stable` or `beta`, user settings only); **Help: Check for Updates…** checks right away.
- **`walph` launcher:** **Shell: Install 'walph' Command in PATH** installs it (macOS: `/usr/local/bin`, Linux:
  `~/.local/bin`, Windows: `%LOCALAPPDATA%\Microsoft\WindowsApps`) and **Shell: Uninstall 'walph' Command from
  PATH** removes it. `walph <folder>` opens the folder as a workspace; with Walph already running, it opens in that
  instance (one instance per data folder).
