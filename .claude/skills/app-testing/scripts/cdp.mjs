#!/usr/bin/env node
// Drives the Walph window (renderer) through the Chrome DevTools Protocol.
//
//   cdp.mjs eval  "<JS expression>"        evaluates in the page (awaits Promises) and prints the value as JSON
//   cdp.mjs wait  "<JS expression>" [ms]   polls until the expression is truthy (default 10000 ms); exits 1 on timeout
//   cdp.mjs open  <dir>                    opens the folder in the TARGET workspace (replaces its folder), waits for the explorer
//   cdp.mjs add   <dir>                    opens the folder as a NEW workspace tab (api.workspaces.add; an already
//                                          open folder just activates its tab) and waits for its view to exist
//   cdp.mjs type  "<text>"                 inserts text into the focused element (does not submit Enter in xterm)
//   cdp.mjs key   <key> [modifiers]        real keydown/keyup; e.g. Enter, Escape, ArrowDown, a
//                                          modifiers: 1=Alt 2=Ctrl 4=Meta(⌘) 8=Shift (add them up)
//   cdp.mjs shot  <file.png>               window screenshot (2x scale on Retina displays)
//   cdp.mjs pages                          lists the view targets: index, title, url, state, workspace (see below)
//   cdp.mjs logs  [ms]                     console errors/warnings and exceptions (includes past ones)
//
// Port: WALPH_CDP_PORT (default 9333).
//
// Target page (every workspace is its own WebContentsView = its own CDP page target; a dormant workspace
// restored from windows.json has NO page until it is activated). WALPH_PAGE picks the page:
//   (unset)     the ACTIVE workspace's view (the visible one) of the first window that has one; else the first page
//   <number>    index among the page targets, as listed by `cdp.mjs pages` (CDP order, stable while the app runs)
//   =text       exact title            (titles are "<folder> — Walph")
//   ws:<n>      the n-th tab of the WorkspaceBar (1-based, same as ⌘n)  — fails if that workspace is dormant
//   ws:<name>   the workspace tab with that folder name (e.g. WALPH_PAGE=ws:projB)
//   <text>      title substring
// Tabs of other windows are reachable by index/title; `ws:` looks inside the window of the first match.

const PORT = process.env.WALPH_CDP_PORT ?? '9333'
const [cmd, arg, arg2] = process.argv.slice(2)

async function listPages() {
  try {
    const pages = await (await fetch(`http://localhost:${PORT}/json`)).json()
    return pages.filter((p) => p.type === 'page')
  } catch {
    console.error(`No app listening on port ${PORT}. Run launch.sh first.`)
    process.exit(2)
  }
}

async function attach(page) {
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  const listeners = []
  let seq = 0
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    } else if (msg.method) {
      for (const l of listeners) l(msg)
    }
  }
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { ws, send, onEvent: (l) => listeners.push(l) }
}

// What a view knows about the WorkspaceBar (preload api): its own id and every tab of its window.
const BAR_STATE = `(async () => {
  const s = await window.api.workspaces.list()
  const me = s.workspaces.findIndex((w) => w.id === s.selfId)
  return { selfId: s.selfId, position: me + 1, active: me >= 0 && s.workspaces[me].active, name: s.workspaces[me]?.name ?? null,
    tabs: s.workspaces.map((w) => ({ id: w.id, name: w.name, active: w.active, dormant: !!w.dormant })) }
})()`

/** Bar state of a page target, or null while the renderer has not exposed the api yet. */
async function barState(page) {
  let conn
  try {
    conn = await attach(page)
    const res = await conn.send('Runtime.evaluate', { expression: BAR_STATE, awaitPromise: true, returnByValue: true })
    return res.result?.exceptionDetails ? null : (res.result?.result?.value ?? null)
  } catch {
    return null
  } finally {
    conn?.ws.close()
  }
}

async function connect() {
  const all = await listPages()
  if (cmd === 'pages') {
    for (const [i, p] of all.entries()) {
      const bar = await barState(p)
      const state = bar ? (bar.active ? 'active' : 'inactive') : '-'
      console.log(`${i}\t${p.title}\t${p.url}\t${state}\t${bar ? `ws:${bar.position} ${bar.name}` : '-'}`)
    }
    process.exit(0)
  }
  const sel = process.env.WALPH_PAGE ?? ''
  let page
  if (sel === '') {
    for (const p of all) {
      if ((await barState(p))?.active) {
        page = p
        break
      }
    }
    page ??= all[0]
  } else if (/^\d+$/.test(sel)) {
    page = all[Number(sel)]
  } else if (sel.startsWith('ws:')) {
    const want = sel.slice(3)
    for (const p of all) {
      const bar = await barState(p)
      if (!bar) continue
      const tab = /^\d+$/.test(want) ? bar.tabs[Number(want) - 1] : bar.tabs.find((t) => t.name === want)
      if (!tab) continue
      page = tab.id === bar.selfId ? p : undefined
      if (!page) {
        for (const q of all) if ((await barState(q))?.selfId === tab.id) page = q
        if (!page) {
          console.error(`Workspace "${tab.name}" is dormant (no view yet). Activate it first: main.mjs command workspace.select<n>.`)
          process.exit(2)
        }
      }
      break
    }
  } else {
    page = all.find((p) => (sel.startsWith('=') ? p.title === sel.slice(1) : p.title.includes(sel)))
  }
  if (!page) {
    console.error(
      all.length ? `No page matches WALPH_PAGE=${sel}. Run "cdp.mjs pages".` : 'The app window has not loaded yet.'
    )
    process.exit(2)
  }
  return attach(page)
}

async function evaluate(send, expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (res.result?.exceptionDetails) {
    const d = res.result.exceptionDetails
    throw new Error(d.exception?.description ?? d.text)
  }
  return res.result?.result?.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(send, expression, timeout) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      const value = await evaluate(send, expression)
      if (value) return value
    } catch {
      // page reloading: try again
    }
    await sleep(150)
  }
  return null
}

const { ws, send, onEvent } = await connect()
let exitCode = 0

try {
  switch (cmd) {
    case 'eval': {
      console.log(JSON.stringify(await evaluate(send, arg), null, 2))
      break
    }
    case 'wait': {
      const value = await waitFor(send, arg, Number(arg2 ?? 10000))
      if (value === null) {
        console.error(`timeout waiting for: ${arg}`)
        exitCode = 1
      } else console.log(JSON.stringify(value))
      break
    }
    case 'open': {
      // The window's folder lives in main: localStorage + reload does not switch it. Go through main's
      // `workspace:openRequested` (main.mjs open), then wait for the explorer to show the new root.
      const { execFileSync } = await import('node:child_process')
      const { fileURLToPath } = await import('node:url')
      execFileSync(process.execPath, [fileURLToPath(new URL('./main.mjs', import.meta.url)), 'open', arg], {
        stdio: 'inherit'
      })
      const ok = await waitFor(
        send,
        `document.querySelectorAll('.tree .tree-row').length > 0 && document.title.includes(${JSON.stringify(arg.split(/[\\/]/).filter(Boolean).pop() ?? arg)})`,
        15000
      )
      if (!ok) {
        console.error('the explorer did not load the folder')
        exitCode = 1
      } else console.log(`workspace opened: ${arg}`)
      break
    }
    case 'add': {
      const { resolve } = await import('node:path')
      const dir = resolve(arg ?? '')
      const added = await evaluate(send, `window.api.workspaces.add(${JSON.stringify(dir)})`)
      // The new workspace becomes the active one: wait until its view answers with it as `workspace.current()`.
      const end = Date.now() + 15000
      let ok = false
      while (Date.now() < end && !ok) {
        for (const p of await listPages()) {
          const c = await attach(p)
          try {
            const cur = await evaluate(c.send, 'window.api.workspace.current()').catch(() => null)
            const rows = await evaluate(c.send, "document.querySelectorAll('.tree .tree-row').length").catch(() => 0)
            if (cur === dir && rows > 0) ok = true
          } finally {
            c.ws.close()
          }
        }
        if (!ok) await sleep(200)
      }
      if (!ok) {
        console.error('the workspace view did not load the folder')
        exitCode = 1
      } else console.log(added ? `workspace added: ${dir}` : `already open, tab activated: ${dir}`)
      break
    }
    case 'type': {
      await send('Input.insertText', { text: arg })
      console.log('ok')
      break
    }
    case 'key': {
      const modifiers = Number(arg2 ?? 0)
      const special = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, F2: 113, F12: 123 }
      const code = special[arg]
      const text = arg === 'Enter' ? '\r' : arg.length === 1 && !(modifiers & 6) ? arg : undefined
      await send('Input.dispatchKeyEvent', {
        type: text ? 'keyDown' : 'rawKeyDown',
        key: arg,
        code: arg.length === 1 ? `Key${arg.toUpperCase()}` : arg,
        windowsVirtualKeyCode: code ?? (arg.length === 1 ? arg.toUpperCase().charCodeAt(0) : undefined),
        text,
        modifiers
      })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: arg, modifiers })
      console.log('ok')
      break
    }
    case 'shot': {
      const res = await send('Page.captureScreenshot', { format: 'png' })
      const fs = await import('node:fs')
      fs.writeFileSync(arg, Buffer.from(res.result.data, 'base64'))
      console.log(`screenshot: ${arg}`)
      break
    }
    case 'logs': {
      const out = []
      onEvent((msg) => {
        if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(msg.params.type)) {
          out.push(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`)
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const d = msg.params.exceptionDetails
          out.push(`[exception] ${d.exception?.description ?? d.text}`)
        } else if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) {
          out.push(`[${msg.params.entry.source}.${msg.params.entry.level}] ${msg.params.entry.text}`)
        }
      })
      await send('Runtime.enable')
      await send('Log.enable')
      await sleep(Number(arg ?? 500))
      console.log(out.length ? out.join('\n') : '(no errors or warnings)')
      break
    }
    default:
      console.error('unknown command; see the header of cdp.mjs')
      exitCode = 2
  }
} catch (err) {
  console.error(err.message)
  exitCode = 1
} finally {
  ws.close()
}
process.exit(exitCode)
