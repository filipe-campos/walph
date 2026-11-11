import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const mounted: { root: Root; host: HTMLElement }[] = []

/** Mounts the element in `document.body`; `unmountAll()` (in `afterEach`) unmounts and cleans up. */
export function mount(node: ReactElement): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(node))
  return host
}

export function unmountAll(): void {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount())
    host.remove()
  }
  document.body.innerHTML = ''
}

/** Lets pending promises and effects settle (IPC response, `useAsync`). */
export async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await act(async () => Promise.resolve())
}

const IMPLICIT: Record<string, string> = {
  button: 'button',
  textarea: 'textbox',
  'input:not([type]),input[type="text"],input[type="email"],input[type="url"],input[type="number"]': 'textbox',
  'input[type="radio"]': 'radio',
  'input[type="checkbox"]': 'checkbox'
}

function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role')
  if (explicit) return explicit
  for (const [selector, role] of Object.entries(IMPLICIT)) if (el.matches(selector)) return role
  return null
}

function nameOf(el: Element): string {
  const label = el.getAttribute('aria-label')
  if (label !== null) return label
  const by = el.getAttribute('aria-labelledby')
  if (by) {
    return by
      .split(' ')
      .map((id) => {
        const target = document.getElementById(id)
        return target ? nameOf(target) : ''
      })
      .join(' ')
      .trim()
  }
  const labels = (el as HTMLInputElement).labels
  if (labels?.length) return Array.from(labels, (l) => l.textContent.trim()).join(' ')
  return el.textContent.replace(/\s+/g, ' ').trim()
}

/** Elements by ARIA role (explicit or implicit) and accessible name (exact text, or regex). */
export function queryAllByRole(root: ParentNode, role: string, name?: string | RegExp): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).filter((el) => {
    if (el.hidden || roleOf(el) !== role) return false
    if (name === undefined) return true
    const actual = nameOf(el)
    return typeof name === 'string' ? actual === name : name.test(actual)
  })
}

export function getByRole(root: ParentNode, role: string, name?: string | RegExp): HTMLElement {
  const found = queryAllByRole(root, role, name)
  if (found.length !== 1) throw new Error(`expected 1 ${role} "${String(name)}", found ${found.length}`)
  return found[0]
}

export function click(el: Element): void {
  act(() => {
    ;(el as HTMLElement).click()
  })
}

/** Types into a React-controlled field: swaps the value through the native setter and fires `input`. */
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string, caret = value.length): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    // number/email/date have no selection (setSelectionRange throws).
    if (el.selectionStart !== null) el.setSelectionRange(caret, caret)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Fires `keydown` and returns whether the handler consumed it (`preventDefault`). */
export function press(el: Element, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => {
    el.dispatchEvent(event)
  })
  return event.defaultPrevented
}

export function focus(el: HTMLElement): void {
  act(() => el.focus())
}
