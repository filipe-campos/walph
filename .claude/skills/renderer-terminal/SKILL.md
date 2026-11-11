---
name: renderer-terminal
description: xterm.js patterns in Walph (TerminalPanel, terminalBus buffering, fit/resize, focus, lifecycle with the pty in main). Use when creating or reviewing anything in src/renderer/src/components/TerminalPanel.tsx, lib/terminalBus.ts or terminal features.
---

# Terminal (`components/TerminalPanel.tsx`, `lib/terminalBus.ts`)

## Data flow

```
pty (main, terminal/create.ts) ──terminal:data──▶ terminalBus ──▶ TerminalView (xterm.write)
TerminalView (xterm.onData) ──terminal:write──▶ pty
ResizeObserver → FitAddon.fit() ──terminal:resize──▶ pty.resize
pty exit ──terminal:exit──▶ App → removeTerminal(id)
```

## Rules

- **Never** subscribe to `window.api.terminal.onData` inside a component. The shell prints its prompt before the
  component mounts; `terminalBus` buffers output per terminal until `attachTerminal(id, listener)` is called.
- Terminal list/active id live in the store (`createTerminal`, `killTerminal`, `removeTerminal`).
- All `TerminalView`s (`.terminal-pane`) stay mounted in ONE flex container; panes outside the active group use `hidden`.
  Never unmount or move them between containers (the xterm would be recreated).
- Only fit/resize when the host has a size: `if (host.offsetWidth === 0 || host.offsetHeight === 0) return`.
- Every `useEffect` that creates xterm resources disposes them: `observer.disconnect()`, `input.dispose()`,
  `detach()`, `term.dispose()`.
- Addons are loaded right after `new Terminal()` and disposed with it. WebGL loads only after `open` and with a measured
  host (retried from the ResizeObserver), per `terminal.gpuAcceleration` (live); `onContextLoss` disposes it (xterm 6
  falls back to the DOM renderer); dispose it before `term.dispose()` (browsers cap live GL contexts).

## Groups, titles, links, find

- `TerminalInfo` = `{ id, groupId, title, customTitle?, profile }`; one panel tab per group (`lib/terminalGroups.ts`:
  `insertAfter`, `removeTerminalFrom`, `groupLabel`). `splitTerminal` creates beside the active one (same profile, same
  `groupId`); a pane's `onFocusCapture` makes it active. Title shown = `customTitle ?? title`; `onTitle` is subscribed in
  `App` (`setTerminalTitle`, early titles wait in `pendingTitles`). Rename = `startRenameTerminal` (inline input in the tab).
- Focus goes through `requestFocus('terminal')` (`focusBridge.ts`: maximize, rename, closing find); `TerminalPanel` registers the target with `useFocusTarget('terminal')` and the returned counter re-runs its focus effect.
- Registry of live xterm/search addons: `components/terminalRegistry.ts`.
- Links (`components/terminalLinks.ts`): `WebLinksAddon` + a link provider for files; text/regex in `lib/terminalLinks.ts`
  (joins wrapped rows, maps string index to cells, URLs excluded); validated on hover with `api.terminal.resolveLink`;
  opens only with ⌘/Ctrl-click (`openFile`, Reveal line 1-based, column 0-based).
- Every link (file, URL, OSC 8) opens only with ⌘/Ctrl-click; URLs only `http(s)`/`mailto` (also filtered in main's
  `setWindowOpenHandler`). File links are resolved by main (`terminal:resolveLink`: shell cwd → window folder → initial
  cwd), never by the renderer.
- `SearchAddon` decorations need `allowProposedApi: true`.
- Profiles (`terminal.profiles`, `terminal.defaultProfile`) are user-only: the renderer sends only the profile name and
  main resolves it (`terminal/resolveProfile.ts`).
- Find: `terminalFindId` in the store (the terminal whose find is open), `TerminalFind.tsx` inside the pane (a second ⌘F refocuses the field through `requestFocus('terminalFind:<id>')`); `.terminal-find` counts as `terminalFocus`.
- Layout: `panelPosition`/`panelWidth` in the session; `panelMaximized` is transient (editor `hidden`, stays mounted).

```typescript
// ✅ CORRECT
const detach = attachTerminal(id, (data) => term.write(data))
return () => detach()

// ❌ WRONG — loses the initial prompt and leaks a listener per remount
useEffect(() => window.api.terminal.onData((tid, d) => tid === id && term.write(d)), [])
```

## Testing gotchas

- Synthetic `insertText` with `\n` does **not** submit in xterm — send a real Enter key (`cdp.mjs key Enter`).
- Text typed before the prompt appears gets echoed twice — wait for the prompt first.
- With WebGL on, `.xterm-rows` is empty: tests that read terminal text set `terminal.gpuAcceleration: "off"`.
