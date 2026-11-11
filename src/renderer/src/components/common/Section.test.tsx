import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Section } from './Section'

const roots: Root[] = []
const hosts: HTMLElement[] = []

function mount(ui: React.JSX.Element): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  hosts.push(host)
  act(() => root.render(ui))
  return host
}

afterEach(() => {
  act(() => roots.splice(0).forEach((r) => r.unmount()))
  hosts.splice(0).forEach((h) => h.remove())
})

describe('Section', () => {
  it('the header is a button with aria-expanded that collapses and expands the content', () => {
    const host = mount(
      <Section title="Changes" count={3}>
        <p>content</p>
      </Section>
    )
    const toggle = host.querySelector<HTMLButtonElement>('button.section-toggle')!
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toContain('Changes')
    expect(toggle.textContent).toContain('3')
    expect(host.querySelector('p')).not.toBeNull()

    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('p')).toBeNull()

    act(() => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('controlled: notifies the parent and the actions stay outside the button', () => {
    const onToggle = vi.fn()
    const onAction = vi.fn()
    const host = mount(
      <Section title="Pilha" open={false} onToggle={onToggle} actions={<button onClick={onAction}>x</button>}>
        <p>content</p>
      </Section>
    )
    const toggle = host.querySelector<HTMLButtonElement>('button.section-toggle')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    act(() => toggle.click())
    expect(onToggle).toHaveBeenCalledWith(true)

    const action = host.querySelector<HTMLButtonElement>('.row-actions button')!
    expect(toggle.contains(action)).toBe(false)
    act(() => action.click())
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
