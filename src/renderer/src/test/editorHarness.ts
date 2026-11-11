import { vi, type Mock } from 'vitest'
import { EditorState, type EditorSelection, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { bindLspHost, lspTabId, type LspHost } from '../components/editor/lspHost'
import { bindLspPaths, lspClose, lspOpen } from '../components/editor/lspSync'
import { pruneTriggers } from '../components/editor/lspTriggers'

type LspHostSpies = { [K in keyof LspHost]: Mock<LspHost[K]> }

/** `LspHost` with each method a `vi.fn`: by default the server `srv` is ready for any file. */
function makeLspHost(overrides: Partial<LspHost> = {}): LspHostSpies {
  return {
    serverFor: vi.fn<LspHost['serverFor']>(overrides.serverFor ?? (() => ({ id: 'srv', ready: true }))),
    goToDefinitionAt: vi.fn<LspHost['goToDefinitionAt']>(overrides.goToDefinitionAt),
    applyCodeAction: vi.fn<LspHost['applyCodeAction']>(overrides.applyCodeAction ?? (() => Promise.resolve())),
    snapshotDocs: vi.fn<LspHost['snapshotDocs']>(overrides.snapshotDocs ?? (() => new Map())),
    openLocation: vi.fn<LspHost['openLocation']>(overrides.openLocation),
    readLines: vi.fn<LspHost['readLines']>(overrides.readLines ?? (() => Promise.resolve(null))),
    runLensCommand: vi.fn<LspHost['runLensCommand']>(overrides.runLensCommand),
    notify: vi.fn<LspHost['notify']>(overrides.notify),
    notifyError: vi.fn<LspHost['notifyError']>(overrides.notifyError),
    featureEnabled: vi.fn<LspHost['featureEnabled']>(overrides.featureEnabled ?? (() => true))
  }
}

type Patched = { target: object; key: string; original: PropertyDescriptor | undefined }
const patched: Patched[] = []

function patch(target: object, key: string, value: unknown): void {
  patched.push({ target, key, original: Object.getOwnPropertyDescriptor(target, key) })
  Object.defineProperty(target, key, { value, configurable: true, writable: true })
}

/** jsdom does not measure text: CodeMirror needs empty rectangles to draw. `restoreDomMeasure` undoes it. */
function stubDomMeasure(): void {
  if (patched.length) return
  const rect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
  patch(Range.prototype, 'getClientRects', () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator]
  }))
  patch(Range.prototype, 'getBoundingClientRect', () => rect)
  patch(Element.prototype, 'scrollIntoView', () => {})
}

function restoreDomMeasure(): void {
  for (const { target, key, original } of patched.splice(0).reverse()) {
    if (original) Object.defineProperty(target, key, original)
    else Reflect.deleteProperty(target, key)
  }
}

export interface EditorOptions {
  doc?: string
  extensions?: Extension[]
  tabId?: string
  /** Path the tab was opened with in the LSP; `null` = tab without a path in the LSP (never opened in `lspSync`). */
  path?: string | null
  host?: Partial<LspHost>
  selection?: EditorSelection | { anchor: number; head?: number }
}

export interface MountedEditor {
  view: EditorView
  host: LspHostSpies
  tabId: string
  path: string | null
}

const mounted: MountedEditor[] = []
const pathsByTab = new Map<string, string>()

/**
 * Mounts an `EditorView` in `document.body` with tab `tabId` open in the LSP (`lspDocPath` returns `path`) and the
 * spy `LspHost` installed. `unmountEditors()` (in `afterEach`) destroys everything and resets the LSP module state.
 */
export function mountEditor({
  doc = '',
  extensions = [],
  tabId = 't1',
  path = '/r/a.ts',
  host: hostOverrides,
  selection
}: EditorOptions = {}): MountedEditor {
  stubDomMeasure()
  const host = makeLspHost(hostOverrides)
  bindLspHost(host)
  bindLspPaths((id) => pathsByTab.get(id))
  if (path) {
    pathsByTab.set(tabId, path)
    lspOpen(tabId, doc)
  }
  const parent = document.body.appendChild(document.createElement('div'))
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, ...(selection && { selection }), extensions: [lspTabId.of(tabId), ...extensions] })
  })
  const editor = { view, host, tabId, path }
  mounted.push(editor)
  return editor
}

export function unmountEditors(): void {
  for (const { view, tabId } of mounted.splice(0)) {
    const parent = view.dom.parentElement
    view.destroy()
    parent?.remove()
    lspClose(tabId)
  }
  bindLspHost(makeLspHost({ serverFor: () => null }))
  bindLspPaths(() => undefined)
  pathsByTab.clear()
  restoreDomMeasure()
  pruneTriggers(new Set())
}
