import { Fragment, useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, type KeyboardEvent } from 'react'
import { useStore } from '../../store'
import type { QuickPicker } from '../../types/quickInput'
import { quickInputMode, type QuickInputMode } from '../../lib/quickOpenQuery'
import { THEMES } from '../../themes'
import { unreadAria, unreadLabel } from '../../lib/workspaces'
import type { QuickItem, QuickList } from './buildItems'
import { buildPickerList, usePickerData } from './pickers'
import { FileIcon } from '../common/FileIcon'
import { Icon } from '../common/Icon'
import { StatusDot } from '../common/StatusDot'
import { useActiveDescendant } from '../common/useActiveDescendant'
import { useRestoreFocus } from '../common/useRestoreFocus'
import { previewTheme } from '../../settingsActions'
import { closeQuickInput, setQuickInputQuery } from '../../quickInputActions'
import { useT } from '../../i18n'

type PaletteMode = QuickInputMode | QuickPicker | 'unified'

const paletteOptionId = (index: number): string => `palette-option-${index}`

export function QuickInput() {
  const session = useStore((s) => s.quickInput?.session)
  // A new QuickInputPanel on every open (the key is the session, not just "open"): the state (selection, previous
  // focus)
  // resets without effects, even when closing and reopening fall in the same batch (a palette command that opens the
  // picker).
  return session === undefined ? null : <QuickInputPanel key={session} />
}

function QuickInputPanel() {
  const t = useT()
  const query = useStore((s) => s.quickInput?.query ?? '')
  const picker = useStore((s) => s.quickInput?.picker)
  // The theme picker ignores the `>` and `:` prefixes.
  const unified = useStore((s) => !!s.quickInput?.unified)
  // In the ⌘K palette the text without a prefix is the unified mode; deleting the prefix goes back to it.
  const typedMode = quickInputMode(query)
  const mode: PaletteMode = picker ?? (unified && typedMode === 'files' ? 'unified' : typedMode)
  // The list follows the deferred query: typing does not wait for the filter of thousands of files.
  const deferred = useDeferredValue(query)
  const restoreFocus = useRestoreFocus()
  const inputRef = useRef<HTMLInputElement>(null)

  const data = usePickerData({ picker, mode, deferred })
  const { cloneCheck } = data
  const buildList = (q: string): QuickList => buildPickerList(q, data)
  const list = useMemo(() => buildPickerList(deferred, data), [data, deferred])
  const { items } = list
  // Consecutive items of the same group become a section (`i` = index in the flat list, which the arrows walk).
  const sections = useMemo(() => {
    const out: { group?: string | undefined; entries: { item: QuickItem; i: number }[] }[] = []
    items.forEach((item, i) => {
      const last = out.at(-1)
      if (last && last.group === item.group) last.entries.push({ item, i })
      else out.push({ group: item.group, entries: [{ item, i }] })
    })
    return out
  }, [items])
  // In the theme picker the selection starts at the current theme.
  const {
    index,
    activeId,
    setIndex,
    onKeyDown: onNavKeyDown
  } = useActiveDescendant({
    count: items.length,
    resetKey: deferred,
    initialIndex:
      picker === 'theme'
        ? Math.max(
            THEMES.findIndex((theme) => theme.name === data.currentTheme),
            0
          )
        : 0,
    idOf: paletteOptionId,
    wrap: true
  })

  useEffect(() => {
    const input = inputRef.current
    input?.focus()
    // With a filled prefix (`>`, `:`), the cursor goes after it.
    input?.setSelectionRange(input.value.length, input.value.length)
  }, [])

  // Previews the theme under the selection (the action only touches the store; there is no setState here).
  const highlightedKey = picker === 'theme' ? items[index]?.key : undefined
  useEffect(() => {
    if (picker === 'theme') previewTheme(highlightedKey ?? null)
  }, [picker, highlightedKey])

  const close = (): void => {
    closeQuickInput()
    restoreFocus()
  }

  // Closes and returns focus before running, so commands that move focus (terminal, editor) prevail.
  const run = (item: QuickItem | undefined): void => {
    if (!item || item.disabled) return
    // Theme picker: confirm before closing. Closing first would discard the preview (going back to the old theme
    // for an instant) and the theme would be applied twice.
    if (picker === 'theme') item.run()
    close()
    if (picker !== 'theme') item.run()
  }

  // Enter while the clone URL is still being checked: runs when the check confirms (dropped if it fails).
  const pendingCloneEnter = useRef<string | null>(null)
  const runPendingClone = useEffectEvent(() => {
    const pending = pendingCloneEnter.current
    if (pending === null || picker !== 'cloneUrl' || !cloneCheck || deferred.trim() !== pending) return
    pendingCloneEnter.current = null
    if (cloneCheck.ok) run(buildList(deferred).items[0])
  })
  useEffect(() => runPendingClone(), [cloneCheck])

  const onKeyDown = (e: KeyboardEvent): void => {
    // An Enter that confirms the IME composition runs nothing.
    if (e.nativeEvent.isComposing) return
    switch (e.key) {
      case 'Tab':
        // Traps focus in the quick input (like VS Code's): outside it ↑/↓/Esc would stop working.
        e.preventDefault()
        return
      case 'Escape':
        e.preventDefault()
        return close()
      case 'Enter': {
        e.preventDefault()
        if (picker === 'cloneUrl' && query.trim() && (deferred !== query || !cloneCheck)) {
          pendingCloneEnter.current = query.trim()
          return
        }
        // Enter right after typing: the deferred list may be behind, so resolves the item of the current query.
        if (deferred === query) return run(items[index])
        return run(buildList(query).items[0])
      }
      default:
        onNavKeyDown(e)
    }
  }

  const text = t.quickInput.modes[mode]
  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={text.label}
        onMouseDown={(e) => {
          e.stopPropagation()
          // A click on a non-focusable area (hint, message, disabled item) must not take focus from the input.
          if (e.target !== inputRef.current) e.preventDefault()
        }}
        onKeyDown={onKeyDown}
      >
        <div className="palette-search">
          <Icon name="search" />
          <input
            ref={inputRef}
            className="palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={activeId}
            aria-label={text.label}
            placeholder={text.placeholder}
            spellCheck={false}
            value={query}
            onChange={(e) => setQuickInputQuery(e.target.value)}
          />
        </div>
        <div className="palette-list">
          <div id="palette-list" role="listbox" aria-label={text.label}>
            {sections.map((section, n) => {
              const options = section.entries.map(({ item, i }) => (
                <Fragment key={item.key}>
                  <div
                    id={paletteOptionId(i)}
                    role="option"
                    aria-selected={i === index}
                    aria-disabled={item.disabled || undefined}
                    className={`palette-item${i === index ? ' selected' : ''}${item.disabled ? ' disabled' : ''}${item.ai ? ' palette-ask' : ''}${picker === 'theme' ? ' hover-only' : ''}`}
                    // In the theme picker the mouse only highlights (CSS :hover); previewing is a keyboard thing, as in
                    // VS Code.
                    onMouseMove={() => picker !== 'theme' && i !== index && setIndex(i)}
                    onClick={() => run(item)}
                  >
                    {item.status ? (
                      // 'none' (dormant workspace) leaves the column empty so the labels align.
                      <span className="palette-status">
                        {item.status !== 'none' && <StatusDot status={item.status} />}
                      </span>
                    ) : item.ai ? (
                      <Icon name="spark" className="palette-icon" />
                    ) : item.fileIcon ? (
                      <FileIcon name={item.fileIcon.name} folder={item.fileIcon.folder} className="palette-icon" />
                    ) : (
                      item.icon && <i className={`codicon ${item.icon} palette-icon`} />
                    )}
                    <span className="palette-label ellipsis">{item.label}</span>
                    {!!item.unread && (
                      <span className="unread-badge palette-unread" role="img" aria-label={unreadAria(item.unread)}>
                        {unreadLabel(item.unread)}
                      </span>
                    )}
                    {item.tag && <span className="palette-recent">{item.tag}</span>}
                    {item.kbd && <kbd className="palette-kbd">{item.kbd}</kbd>}
                  </div>
                </Fragment>
              ))
              // Each group is a `group` of the listbox labeled by the header; the option ids stay flat (index).
              return section.group ? (
                <div key={`g:${section.group}:${n}`} role="group" aria-labelledby={`palette-group-${n}`}>
                  <div id={`palette-group-${n}`} className="palette-group" data-group={section.group}>
                    {section.group}
                  </div>
                  {options}
                </div>
              ) : (
                <Fragment key={`o:${n}`}>{options}</Fragment>
              )
            })}
          </div>
          {/* Messages outside the listbox (which can only have options); the live region announces them. */}
          <div role="status" aria-live="polite">
            {items.length === 0 && list.message && <div className="palette-empty">{list.message}</div>}
            {items.length > 0 && list.hint && <div className="palette-hint">{list.hint}</div>}
          </div>
        </div>
        <div className="palette-foot" aria-hidden>
          <span>
            <kbd>↑↓</kbd> {t.quickInput.footer.navigate}
          </span>
          <span>
            <kbd>↵</kbd> {t.quickInput.footer.select}
          </span>
          <span>
            <kbd>Esc</kbd> {t.quickInput.footer.close}
          </span>
        </div>
      </div>
    </div>
  )
}
