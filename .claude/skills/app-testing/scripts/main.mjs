#!/usr/bin/env node
// Talks to the Walph MAIN process through the Node inspector (port WALPH_INSPECT_PORT, default 9334).
//
//   main.mjs command <id>         sends app:command <id> to the target view — the same path the menu shortcuts take.
//                                 <id> is a CommandId from src/shared/commands.ts, e.g. editor.save, workbench.closeTab,
//                                 view.search, terminal.toggle, workbench.showCommandPalette, workspace.select2,
//                                 workspace.add, workspace.close
//                                 Use this instead of a synthetic ⌘S.
//   main.mjs open <dir>           sends workspace:openRequested <dir> to the target view (same path as Abrir Recente:
//                                 the renderer asks about unsaved files, then calls workspace.open — it replaces the
//                                 folder OF THAT workspace; to add a tab use `cdp.mjs add <dir>`)
//   main.mjs views                lists the workspace views: index, window id, active?, title, url
//   main.mjs eval "<expression>"  evaluates in main; `electron` is already in scope (promises are awaited)
//
// Target view (the host window is a BaseWindow with one WebContentsView per workspace; there is no
// BrowserWindow, so `BrowserWindow.getAllWindows()` is empty). WALPH_PAGE picks the view:
//   (unset)     the ACTIVE (visible) view of the focused window, else of the first window — what the native menu does
//   <number>    index in the `main.mjs views` list
//   =text       exact title            (titles are "<folder> — Walph")
//   ws:<n>      the n-th tab of the WorkspaceBar (1-based, same as ⌘n) — fails if that workspace is dormant
//   ws:<name>   the workspace tab with that folder name
//   <text>      title substring

const PORT = process.env.WALPH_INSPECT_PORT ?? '9334'
const [cmd, arg] = process.argv.slice(2)

let targets
try {
  targets = await (await fetch(`http://localhost:${PORT}/json`)).json()
} catch {
  console.error(`Main inspector is not on port ${PORT}. Run launch.sh first.`)
  process.exit(2)
}

// Own scope: the inspector's global scope persists between calls and a repeated `const` would throw.
const wrap = (body) => `{ const electron = process.mainModule.require('electron'); ${body} }`
const wrapAsync = (body) => `(async () => { const electron = process.mainModule.require('electron'); ${body} })()`

// Finds the views of every live window: [{ wc, win, active, index }] in window order (children = creation order).
const VIEWS = `
  const all = [];
  for (const win of electron.BaseWindow.getAllWindows()) {
    for (const v of win.contentView.children) {
      const wc = v.webContents;
      if (wc && !wc.isDestroyed()) all.push({ wc, win, active: v.getVisible(), index: all.length });
    }
  }
  const BAR = ${JSON.stringify('(async () => { const s = await window.api.workspaces.list(); return { selfId: s.selfId, tabs: s.workspaces.map((w) => ({ id: w.id, name: w.name })) } })()')};
  const bar = (wc) => wc.executeJavaScript(BAR).catch(() => null);
  const sel = ${JSON.stringify(cmd === 'views' ? '' : (process.env.WALPH_PAGE ?? ''))};
  let target;
  if (sel === '') {
    const focused = electron.BaseWindow.getFocusedWindow();
    target = all.find((x) => x.win === focused && x.active) ?? all.find((x) => x.active) ?? all[0];
  } else if (/^\\d+$/.test(sel)) {
    target = all[Number(sel)];
  } else if (sel.startsWith('ws:')) {
    const want = sel.slice(3);
    for (const x of all) {
      const b = await bar(x.wc);
      if (!b) continue;
      const tab = /^\\d+$/.test(want) ? b.tabs[Number(want) - 1] : b.tabs.find((t) => t.name === want);
      if (!tab) continue;
      for (const y of all) if (y.win === x.win && (await bar(y.wc))?.selfId === tab.id) target = y;
      if (!target) throw new Error('Workspace "' + tab.name + '" is dormant (no view yet). Activate it first (command workspace.select<n>).');
      break;
    }
  } else {
    target = all.find((x) => (sel.startsWith('=') ? x.wc.getTitle() === sel.slice(1) : x.wc.getTitle().includes(sel)));
  }
`

const send = (channel) =>
  wrapAsync(
    `${VIEWS} if (!target) return 'no view (WALPH_PAGE=' + sel + ')'; target.wc.send(${JSON.stringify(channel)}, ${JSON.stringify(arg)}); return 'sent to view ' + target.index + ': ' + ${JSON.stringify(arg)};`
  )
const expression =
  cmd === 'command'
    ? send('app:command')
    : cmd === 'open'
      ? send('workspace:openRequested')
      : cmd === 'views'
        ? wrapAsync(
            `${VIEWS} return all.map((x) => [x.index, 'win ' + x.win.id, x.active ? 'active' : 'inactive', x.wc.getTitle(), x.wc.getURL()].join('\\t')).join('\\n') || '(no views)';`
          )
        : cmd === 'eval'
          ? wrap(arg)
          : null

if (!expression) {
  console.error('usage: main.mjs command <id> | main.mjs open <dir> | main.mjs views | main.mjs eval "<expr>"')
  process.exit(2)
}

const ws = new WebSocket(targets[0].webSocketDebuggerUrl)
await new Promise((resolve) => (ws.onopen = resolve))
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id !== 1) return
  const r = msg.result
  if (r?.exceptionDetails) {
    console.error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    process.exitCode = 1
  } else if (cmd === 'views') {
    console.log(r?.result?.value ?? '(no views)')
  } else {
    console.log(JSON.stringify(r?.result?.value ?? r?.result?.description ?? null))
  }
  ws.close()
}
ws.send(
  JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, includeCommandLineAPI: true, awaitPromise: true }
  })
)
