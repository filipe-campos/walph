# Changelog

All notable changes to Walph are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Walph is now open source under the [MIT License](LICENSE).
- Community files: contributing guide, code of conduct, security policy, issue forms and pull request template.
- Funding links and a "Apoiar o Walph" (Support Walph) entry in the Help menu.
- New documentation for contributors, including an architecture overview in `docs/`.

## [0.5.0] - 2026-11-03

### Added

- Claude panel: the prompt is enabled only after the session finishes loading, `/usage` opens in a modal, `/logout` and
  login from the panel, clickable file and web links in messages, favorite sessions reorderable by drag and drop, and
  a default "No context" option.
- Claude panel: random status words replace the fixed "Thinking…" indicator.
- Explorer: copy, cut, paste and duplicate files and folders, including files copied from the Finder clipboard.
- Editor: image viewer, and syntax highlighting for `.env` and `.yml` files.
- Terminal: macOS line editing shortcuts (`⌘⌫`, `⌥←` and `⌥→`).
- Search: the sidebar search results are fully navigable with the keyboard.

### Changed

- Workspace bar: dragging a workspace tab leaves an empty slot in its place.
- Faster rendering of large explorer and git trees.
- Faster session saving when many Claude tabs are open.

### Fixed

- Fonts and icons are sharp on 1x (non-Retina) displays.
- Claude panel: stable scrolling with very long messages.
- Claude panel: concurrent rewinds are prevented and session titles stay consistent.
- Explorer: create, rename, move and delete operations are restricted to the workspace folder.
- Explorer: renaming only the letter case of a file works, and a rename never overwrites another item.
- Explorer: pressing Enter while composing text with an IME no longer confirms the rename.
- Workspace settings are restricted to the workspace folder, and quick consecutive setting changes are no longer lost.
- Switching folders discards state and late responses that belonged to the previous folder.
- Language server listeners are registered only once per workspace.
- Auto save stays suspended while a window is closing, and unsaved changes prompts are consistent.
- The explorer context menu reports an error instead of failing silently.

## [0.4.0] - 2026-10-21

### Added

- Workspace tab context menu to mute and unmute notifications per workspace (persisted across restarts).
- "Copy Relative Path" in the explorer.
- `claude.effort` setting for the default effort of new conversations, adjusted to what the model supports.
- `claude.idleSleepMinutes` setting to control when idle Claude conversations are suspended (default: never).
- Markdown editing: Enter no longer continues lists, and selections can be wrapped with `*`, `_` and `` ` ``.
- Search and more icons in the favorite commands of the Claude panel.

### Changed

- Workspace tabs animate while being dragged, and show the parent folder below the branch name.
- The Claude agents strip is collapsed by default.
- Idle workspaces hibernate after 120 minutes instead of 30.

### Fixed

- The Claude prompt no longer flickers with large text.
- Idle Claude conversations are no longer suspended automatically, which used to disconnect their MCP servers.
- The first message of a conversation waits (up to 15 seconds) for MCP servers to connect, and warns about the ones that
  did not.

## [0.3.0] - 2026-10-20

### Added

- MCP server manager: `/mcp`, the panel menu and the command palette open a modal with the status, tools and redacted
  configuration of each server. Servers can be enabled, disabled, reconnected, authenticated through OAuth, and added or
  removed in the local, project and user scopes. Secret values never leave the main process.
- MCP elicitation requests (form or URL) are shown as a card in the Claude panel instead of being declined.
- Claude panel: usage limit warnings, API retry lines, blocked tool calls, subagent summaries, tool durations and a
  suggested next prompt (accepted with Tab).
- Claude panel: model fallback after a refusal (`claude.fallbackModel`), and the `/` menu updates when the available
  commands change.
- Claude panel: model search and a fixed effort card in the model menu.
- `⌘F` finds text in the current Claude session.
- Explorer: drag and drop to move files and folders, and the Delete key moves the selection to the trash.
- Editor: floating find and replace panel, in the style of VS Code.
- The workspace tab pulses with a yellow border while Claude is waiting for the user.
- The status bar branch shows an asterisk when there are uncommitted changes.

## [0.2.1] - 2026-10-19

### Fixed

- The text selection is visible on the active line of the editor.
- Markdown highlighting supports GFM (strikethrough, tables, task lists) and highlights fenced code blocks, with
  dedicated colors for bold, italic, strikethrough, inline code, quotes and headings.

## [0.2.0] - 2026-10-19

First tagged release.

### Added

- Code editor built on CodeMirror 6, with tabs, dirty tracking, conflict detection when a file changes on disk, a split
  editor with two groups and a Markdown preview.
- Command palette, unified palette (`⌘K`), Quick Open and Go to Line, with all actions available as commands.
- Settings with user and workspace scopes (JSONC files and a Settings modal with reset), customizable keybindings with
  chords, and the Walph Dark and Walph Light themes.
- Sessions and multiple windows: open tabs and cursors are restored, recent folders, and several workspaces per window
  through the workspace bar (`Ctrl+Tab` switches between them).
- Welcome screen with recent folders, opening several folders at once, cloning a repository and starting directly with
  Claude.
- Explorer with file operations (create, rename, move to trash), ignored files and file icons.
- Git integration: status, stage, commit and amend, branches, discard, log, stash, and pull, push and sync.
- Project-wide search and replace powered by ripgrep.
- Language server support: diagnostics, completions, hover, navigation and formatting, with TypeScript bundled.
- Integrated terminal based on xterm.js and node-pty, with search and clickable links.
- Claude Code panel built on the Claude Agent SDK: conversations per workspace, permission prompts, questions, inline
  diffs, prompt attachments, the `/` command menu, modes and model selection, session status and OS notifications.
- Claude panel tracks `/loop` and background agents, with a stop button per task and sound on alerts.
- Containers screen for Docker: containers and Compose projects, logs, stats, actions, and "investigate with Claude".
- Full status bar with file encoding, last commit and clickable items.
- Installers for macOS (dmg and zip), Windows (NSIS) and Linux (AppImage and deb), with automatic updates through
  GitHub Releases on the stable and beta channels.
- Single instance per data folder: opening a folder again reuses the running app.
- `walph` command line launcher, installable from the app on macOS, Windows and Linux.
- Walph design system applied across the UI, with Geist and JetBrains Mono fonts bundled.

[Unreleased]: https://github.com/filipe-campos/walph/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/filipe-campos/walph/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/filipe-campos/walph/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/filipe-campos/walph/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/filipe-campos/walph/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/filipe-campos/walph/releases/tag/v0.2.0
