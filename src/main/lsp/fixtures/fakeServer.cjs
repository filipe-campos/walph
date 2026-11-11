// Minimal LSP server for the manager tests (JSON-RPC over stdio, no dependencies).
let buffer = Buffer.alloc(0)
let nextId = 1000
const waiting = new Map()
const watched = []
let semanticSeq = 0
let deltaCalls = 0
let configured = null

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8')
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`)
  process.stdout.write(body)
}
const reply = (id, result) => send({ id, result })
const fail = (id, code, message) => send({ id, error: { code, message } })
const callClient = (method, params) =>
  new Promise((resolve) => {
    const id = nextId++
    waiting.set(id, resolve)
    send({ id, method, params })
  })
const range = (l, a, b) => ({ start: { line: l, character: a }, end: { line: l, character: b } })

async function handle(msg) {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize':
      return reply(id, {
        capabilities: {
          textDocumentSync: { openClose: true, change: 2 },
          completionProvider: { resolveProvider: true, triggerCharacters: ['.'] },
          hoverProvider: true,
          renameProvider: { prepareProvider: true },
          codeActionProvider: { resolveProvider: true },
          executeCommandProvider: { commands: ['fake.ok'] },
          inlayHintProvider: true,
          documentHighlightProvider: true,
          semanticTokensProvider: {
            legend: { tokenTypes: ['variable', 'function'], tokenModifiers: ['readonly'] },
            full: { delta: true }
          },
          codeLensProvider: { resolveProvider: true },
          callHierarchyProvider: true
        }
      })
    case 'initialized':
      // Registers watchers: `**/*.watch` (create/delete only) and a RelativePattern for `sub`.
      void callClient('client/registerCapability', {
        registrations: [
          {
            id: 'w1',
            method: 'workspace/didChangeWatchedFiles',
            registerOptions: {
              watchers: [
                { globPattern: '**/*.watch', kind: 5 },
                { globPattern: { baseUri: process.env.FAKE_WATCH_BASE, pattern: '*.rel' } }
              ]
            }
          }
        ]
      })
      return
    case 'workspace/didChangeConfiguration':
      configured = params.settings
      return
    case 'workspace/didChangeWatchedFiles':
      watched.push(...params.changes)
      return
    case 'shutdown':
      return reply(id, null)
    case 'exit':
      return process.exit(0)
    case 'textDocument/hover': {
      const line = params.position.line
      if (line === 60) return reply(id, { contents: JSON.stringify(watched) })
      if (line === 61) {
        await callClient('workspace/codeLens/refresh', null)
        return reply(id, { contents: 'refreshed' })
      }
      if (line === 62) return reply(id, { contents: JSON.stringify(configured) })
      if (line === 99) return // never answers: the client must hit the deadline
      if (line === 70) {
        await callClient('workspace/semanticTokens/refresh', null)
        return reply(id, { contents: 'refreshed' })
      }
      if (line === 50) {
        const result = await callClient('workspace/applyEdit', {
          label: 'Test',
          edit: { changes: { [params.textDocument.uri]: [{ range: range(0, 0, 0), newText: 'x' }] } }
        })
        return reply(id, {
          contents: `applied=${result.applied}${result.failureReason ? ' ' + result.failureReason : ''}`
        })
      }
      if (line === 51) {
        const result = await callClient('workspace/applyEdit', {
          edit: { documentChanges: [{ kind: 'create', uri: params.textDocument.uri + '.new' }] }
        })
        return reply(id, { contents: `applied=${result.applied} ${result.failureReason}` })
      }
      return reply(id, { contents: { kind: 'markdown', value: `hover ${line}` } })
    }
    case 'textDocument/completion':
      if (params.position.line === 98) return setTimeout(() => reply(id, [{ label: 'late' }]), 400)
      return reply(id, {
        isIncomplete: false,
        items: [
          { label: 'alpha', kind: 3, data: { n: 1 } },
          { label: 'beta', kind: 6, data: { n: 2 } }
        ]
      })
    case 'completionItem/resolve':
      return reply(id, { ...params, detail: `resolved ${params.data.n}`, documentation: 'doc' })
    case 'textDocument/prepareRename':
      if (params.position.line === 7) return fail(id, -32603, 'You cannot rename this element.')
      return reply(id, { range: range(0, 0, 3), placeholder: 'abc' })
    case 'textDocument/rename':
      if (params.newName === 'create')
        return reply(id, { documentChanges: [{ kind: 'create', uri: params.textDocument.uri + '.new' }] })
      if (params.newName === 'error') return fail(id, -32603, 'invalid name')
      return reply(id, { changes: { [params.textDocument.uri]: [{ range: range(0, 0, 3), newText: params.newName }] } })
    case 'textDocument/codeAction':
      return reply(id, [
        {
          title: 'Already done',
          kind: 'quickfix',
          edit: { changes: { [params.textDocument.uri]: [{ range: range(0, 0, 0), newText: 'a' }] } }
        },
        { title: 'Needs resolve', kind: 'refactor', data: 1 },
        { title: 'Nothing', kind: 'refactor', data: 2 },
        { title: 'Command', command: 'fake.ok', arguments: [1] },
        { title: 'Echo', kind: 'quickfix', data: 'diag', diagnosticsSeen: params.context.diagnostics.length }
      ])
    case 'codeAction/resolve':
      if (params.data === 1) return reply(id, { ...params, edit: { changes: { [params.title && 'file:///x']: [] } } })
      return reply(id, params)
    case 'workspace/executeCommand':
      return reply(id, null)
    case 'textDocument/inlayHint':
      return reply(id, [
        { position: params.range.start, label: 'start:', kind: 2, paddingRight: true },
        { position: { line: -1, character: 0 }, label: 'malformed' }
      ])
    case 'textDocument/documentHighlight':
      return reply(id, [
        { range: range(params.position.line, 0, 3), kind: 3 },
        { range: range(params.position.line + 1, 0, 3), kind: 2 }
      ])
    case 'textDocument/semanticTokens/full':
      return reply(id, { resultId: `r${++semanticSeq}`, data: [0, 0, 3, 0, 1] })
    // The 2nd delta refuses the resultId (the client must fall back to the full request).
    case 'textDocument/semanticTokens/full/delta':
      if (++deltaCalls === 2) return fail(id, -32602, 'unknown resultId')
      return reply(id, { resultId: `r${++semanticSeq}`, edits: [{ start: 3, deleteCount: 1, data: [1] }] })
    case 'textDocument/codeLens':
      return reply(id, [
        { range: range(0, 0, 3), data: params.textDocument.uri },
        { range: range(1, 0, 1), command: { title: 'ready', command: 'fake.ok' } }
      ])
    case 'codeLens/resolve': {
      const uri = params.data
      return reply(id, {
        ...params,
        command: {
          title: '1 reference',
          command: 'editor.action.showReferences',
          arguments: [uri, params.range.start, [{ uri, range: range(0, 1, 2) }]]
        }
      })
    }
    case 'textDocument/prepareCallHierarchy': {
      const { uri } = params.textDocument
      return reply(id, [
        { name: 'abc', kind: 12, uri, range: range(0, 0, 3), selectionRange: range(0, 0, 3), data: 'root' }
      ])
    }
    case 'callHierarchy/incomingCalls':
    case 'callHierarchy/outgoingCalls': {
      const item = {
        ...params.item,
        name: `${method.endsWith('incomingCalls') ? 'in' : 'out'}:${params.item.data}`,
        data: `${params.item.data}>`
      }
      return reply(id, [{ [method.endsWith('incomingCalls') ? 'from' : 'to']: item, fromRanges: [range(0, 1, 2)] }])
    }
    default:
      if (id !== undefined) return fail(id, -32601, 'not supported')
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const sep = buffer.indexOf('\r\n\r\n')
    if (sep < 0) return
    const length = Number(/Content-Length: (\d+)/i.exec(buffer.slice(0, sep).toString())[1])
    if (buffer.length < sep + 4 + length) return
    const msg = JSON.parse(buffer.slice(sep + 4, sep + 4 + length).toString('utf8'))
    buffer = buffer.slice(sep + 4 + length)
    if (msg.method === undefined && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg.result)
      waiting.delete(msg.id)
    } else void handle(msg)
  }
})
