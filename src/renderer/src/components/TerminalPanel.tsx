import { useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import type * as WebglModule from '@xterm/addon-webgl'
import type { WebglAddon } from '@xterm/addon-webgl'
import { selectThemeName, useStore } from '../store'
import { findTheme } from '../themes'
import { attachTerminalAcked, notifyTerminalInput } from '../lib/terminalBus'
import { terminalKeySequence } from '../lib/terminalKeys'
import { TerminalFind } from './TerminalFind'
import { useFocusTarget } from './common/useFocusTarget'
import { registerTerminalLinks, terminalLinkHandler } from './terminalLinks'
import { focusTerminal, searches, terms } from './terminalRegistry'
import { activateTerminal } from '../terminalActions'

// The WebGL addon is only loaded when someone needs it (GPU on and terminal in view).
let webglModule: Promise<typeof WebglModule> | null = null
function loadWebgl(): Promise<typeof WebglModule> {
  webglModule ??= import('@xterm/addon-webgl')
  return webglModule
}

/** Turns a terminal's WebGL renderer on/off. Without WebGL (or on context loss) xterm 6 uses the DOM. */
interface GpuControl {
  set(enabled: boolean): void
}

/** 20px lines for the design system 13px font (13/20); other sizes keep the ratio, in whole px. */
function lineHeightFor(fontSize: number): number {
  return Math.max(1, Math.round((fontSize * 20) / 13)) / fontSize
}

function TerminalView({
  id,
  visible,
  shown,
  focused,
  split
}: {
  id: string
  visible: boolean
  /**
   * Actually visible: active group, panel open on the Terminal view and active workspace. Hidden, WebGL is released.
   */
  shown: boolean
  focused: boolean
  split: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const themeName = useStore(selectThemeName)
  const fontSize = useStore((s) => s.settings['terminal.fontSize'])
  const gpu = useStore((s) => s.settings['terminal.gpuAcceleration'])
  const scrollback = useStore((s) => s.settings['terminal.scrollback'])
  const findOpen = useStore((s) => s.terminalFindId === id)
  // Filled by the creation effect: the theme/font/GPU effects below operate on the same xterm.
  const termRef = useRef<Terminal | null>(null)
  const resizeRef = useRef<() => void>(() => {})
  const gpuRef = useRef<GpuControl>({ set: () => {} })

  useEffect(() => {
    const host = hostRef.current!
    const initial = useStore.getState()
    const term = new Terminal({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace',
      fontSize: initial.settings['terminal.fontSize'],
      lineHeight: lineHeightFor(initial.settings['terminal.fontSize']),
      // Steady cursor (design system): continuous motion is reserved for AI.
      cursorBlink: false,
      scrollback: initial.settings['terminal.scrollback'],
      macOptionIsMeta: true,
      // The search decorations (highlight and result count) are xterm proposed API.
      allowProposedApi: true,
      // OSC 8 hyperlinks: without this xterm opens a confirm() in English and a blank window.
      linkHandler: terminalLinkHandler,
      theme: findTheme(selectThemeName(initial)).terminal
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.open(host)
    terms.set(id, term)
    searches.set(id, search)
    termRef.current = term
    const links = registerTerminalLinks(term, id)

    // WebGL: the addon only loads after `open`, with the container measured (hidden has zero size) and the terminal in
    // view; `epoch` invalidates the async import if, while it loaded, the terminal was hidden or destroyed.
    let wantGpu = false
    let webgl: WebglAddon | null = null
    let gpuFailed = false
    let epoch = 0
    const dropWebgl = (): void => {
      epoch++
      webgl?.dispose()
      webgl = null
    }
    const tryWebgl = (): void => {
      if (!wantGpu || webgl || gpuFailed || host.offsetWidth === 0 || host.offsetHeight === 0) return
      const mine = ++epoch
      void loadWebgl()
        .then(({ WebglAddon }) => {
          if (mine !== epoch || !wantGpu || webgl) return
          const addon = new WebglAddon()
          // Context lost (browser limit, GPU reset): drops the addon and xterm falls back to the DOM renderer.
          addon.onContextLoss(() => {
            gpuFailed = true
            dropWebgl()
          })
          term.loadAddon(addon)
          webgl = addon
        })
        .catch(() => {
          if (mine === epoch) gpuFailed = true
        })
    }
    gpuRef.current = {
      set: (enabled) => {
        wantGpu = enabled
        gpuFailed = false
        if (enabled) tryWebgl()
        else dropWebgl()
      }
    }

    const detach = attachTerminalAcked(id, (data, done) => term.write(data, done))
    // macOS line shortcuts: xterm does not translate them. Returning `false` in the three event phases keeps it
    // from also writing the key (keydown) or a character (keypress).
    term.attachCustomKeyEventHandler((e) => {
      const seq = terminalKeySequence(e, window.api.platform)
      if (!seq) return true
      if (e.type === 'keydown') {
        e.preventDefault()
        window.api.terminal.write(id, seq)
        notifyTerminalInput(id, seq)
      }
      return false
    })
    const input = term.onData((data) => {
      window.api.terminal.write(id, data)
      notifyTerminalInput(id, data)
    })

    // Copy on select: reads the setting on the spot (no recreation) and waits for the selection to settle (dragging
    // fires a lot).
    let copyTimer: ReturnType<typeof setTimeout> | undefined
    const selection = term.onSelectionChange(() => {
      clearTimeout(copyTimer)
      if (!useStore.getState().settings['terminal.copyOnSelection']) return
      copyTimer = setTimeout(() => {
        const text = term.getSelection()
        // Without clipboard permission, fails silently.
        if (text) navigator.clipboard.writeText(text).catch(() => {})
      }, 120)
    })

    const resize = (): void => {
      // A hidden panel (display: none) has zero size: does not resize the pty.
      if (host.offsetWidth === 0 || host.offsetHeight === 0) return
      tryWebgl()
      fit.fit()
      window.api.terminal.resize(id, term.cols, term.rows)
    }
    resizeRef.current = resize
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    return () => {
      observer.disconnect()
      clearTimeout(copyTimer)
      selection.dispose()
      input.dispose()
      detach()
      links.dispose()
      // Releases the WebGL context right away: the browser limits live contexts (~16).
      gpuRef.current = { set: () => {} }
      dropWebgl()
      terms.delete(id)
      searches.delete(id)
      termRef.current = null
      resizeRef.current = () => {}
      term.dispose()
    }
  }, [id])

  // GPU only with the terminal in view: a hidden group, closed panel or inactive workspace release the WebGL context
  // (the browser limits ~16) and xterm stays on the DOM renderer until it comes back.
  useEffect(() => {
    gpuRef.current.set(gpu === 'auto' && shown)
  }, [gpu, shown, id])

  // Live theme and font: xterm repaints by itself; the font changes the cell size, so it refits the columns.
  useEffect(() => {
    const term = termRef.current
    if (term) term.options.theme = findTheme(themeName).terminal
  }, [themeName])

  // Live scrollback: xterm trims the excess by itself when it shrinks.
  useEffect(() => {
    const term = termRef.current
    if (term && term.options.scrollback !== scrollback) term.options.scrollback = scrollback
  }, [scrollback])

  useEffect(() => {
    const term = termRef.current
    if (!term || term.options.fontSize === fontSize) return
    term.options.fontSize = fontSize
    term.options.lineHeight = lineHeightFor(fontSize)
    resizeRef.current()
  }, [fontSize])

  return (
    // Clicking or focusing anything in the pane (xterm, search) makes it the active terminal.
    <div
      className={`terminal-pane${split && focused ? ' focused' : ''}`}
      hidden={!visible}
      onFocusCapture={() => activateTerminal(id)}
    >
      <div className="terminal-view" ref={hostRef} />
      {findOpen && <TerminalFind id={id} />}
    </div>
  )
}

/**
 * Body of the "Terminal" view of the bottom panel. All terminals stay mounted in the same container (they never
 * unmount to hide: xterm would lose the output); only those of the active group show, side by side.
 */
export function TerminalPanel() {
  // Only ids and groups: a new title (changes on every command) does not re-render the panes.
  const keys = useStore(useShallow((s) => s.terminals.map((t) => `${t.id}\n${t.groupId}`)))
  const activeId = useStore((s) => s.activeTerminalId)
  const activeGroup = useStore((s) => s.terminals.find((t) => t.id === s.activeTerminalId)?.groupId)
  const focusRequests = useFocusTarget('terminal')
  const panelShown = useStore((s) => s.terminalVisible && s.panelView === 'terminal')
  const viewActive = useStore((s) => s.viewActive)
  const shown = panelShown && viewActive
  const terminals = useMemo(
    () =>
      keys.map((k) => {
        const [id = '', groupId = ''] = k.split('\n')
        return { id, groupId }
      }),
    [keys]
  )
  const groupSize = useMemo(() => {
    const sizes = new Map<string, number>()
    for (const t of terminals) sizes.set(t.groupId, (sizes.get(t.groupId) ?? 0) + 1)
    return sizes
  }, [terminals])

  // Search/rename of the active terminal: the new id makes the effect run and only it is "just opened".
  const findId = useStore((s) => (s.terminalFindId === s.activeTerminalId ? s.terminalFindId : null))
  const renamingId = useStore((s) => (s.renamingTerminalId === s.activeTerminalId ? s.renamingTerminalId : null))
  const handledFind = useRef<string | null>(null)
  const handledRename = useRef<string | null>(null)

  useEffect(() => {
    const { terminalFindId, renamingTerminalId } = useStore.getState()
    // Closed for good: the next request is "just opened" again (open for another terminal, it still holds).
    if (!terminalFindId) handledFind.current = null
    if (!renamingTerminalId) handledRename.current = null
    if (!panelShown) return
    // The field just opened (in the same commit): it focuses itself, and stealing focus to xterm would close it.
    if (findId !== null) {
      const fresh = handledFind.current !== findId
      handledFind.current = findId
      if (fresh) return
      // It was already open (panel reopened, tab switch, maximize): focus returns to the field.
      document.querySelector<HTMLInputElement>('.terminal-pane:not([hidden]) .terminal-find-input')?.focus()
      return
    }
    if (renamingId !== null) {
      const fresh = handledRename.current !== renamingId
      handledRename.current = renamingId
      if (fresh) return
      document.querySelector<HTMLInputElement>('.panel-header .terminal-rename-input')?.focus()
      return
    }
    focusTerminal(activeId)
  }, [panelShown, activeId, focusRequests, findId, renamingId])

  return (
    <div className="terminal-views">
      {terminals.map((t) => (
        <TerminalView
          key={t.id}
          id={t.id}
          visible={t.groupId === activeGroup}
          shown={shown && t.groupId === activeGroup}
          focused={t.id === activeId}
          split={(groupSize.get(t.groupId) ?? 1) > 1}
        />
      ))}
    </div>
  )
}
