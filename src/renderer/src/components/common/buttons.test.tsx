import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../../test/fakeApi'

installFakeApi()

const { Button } = await import('./Button')
const { IconButton } = await import('./IconButton')
const { Toggle } = await import('./Toggle')

let root: Root | null = null
const host = document.createElement('div')

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
})

function mount(node: React.JSX.Element): HTMLButtonElement {
  root = createRoot(host)
  act(() => root!.render(node))
  return host.querySelector('button')!
}

describe('Button', () => {
  it('uses secondary/md and type=button by default', () => {
    const button = mount(<Button>Ok</Button>)
    expect(button.className).toBe('button button-secondary')
    expect(button.type).toBe('button')
  })

  it('composes variant and size', () => {
    const button = mount(
      <Button variant="primary" size="xs" className="extra">
        Ok
      </Button>
    )
    expect(button.className).toBe('button button-primary button-xs extra')
  })

  it('busy sets aria-disabled and blocks the click', () => {
    const onClick = vi.fn()
    const button = mount(
      <Button busy onClick={onClick}>
        Ok
      </Button>
    )
    act(() => button.click())
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('busy does not submit the form', () => {
    const onSubmit = vi.fn((e: React.SyntheticEvent) => e.preventDefault())
    const button = mount(
      <form onSubmit={onSubmit}>
        <Button type="submit" busy>
          Ok
        </Button>
      </form>
    )
    act(() => button.click())
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('IconButton', () => {
  it('label becomes aria-label and tooltip; title=null removes the tooltip', () => {
    const button = mount(<IconButton icon="codicon-copy" label="Copy" />)
    expect(button.getAttribute('aria-label')).toBe('Copy')
    expect(button.title).toBe('Copy')
    act(() => root!.render(<IconButton icon="codicon-copy" label="Copy" title={null} />))
    expect(host.querySelector('button')!.hasAttribute('title')).toBe(false)
  })

  it('appends the shortcut to the tooltip', () => {
    const button = mount(<IconButton icon="codicon-new-file" label="New file" shortcut="⌘N" />)
    expect(button.title).toBe('New file (⌘N)')
    expect(button.getAttribute('aria-label')).toBe('New file')
  })

  it('forwards ref, active, pressed and children in place of the icon', () => {
    const ref = createRef<HTMLButtonElement>()
    const button = mount(
      <IconButton ref={ref} label="Estrela" active pressed>
        <b>x</b>
      </IconButton>
    )
    expect(ref.current).toBe(button)
    expect(button.className).toBe('icon-button active')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.querySelector('b')).not.toBeNull()
    expect(button.querySelector('.codicon')).toBeNull()
  })

  it('busy blocks the click without disabling the button', () => {
    const onClick = vi.fn()
    const button = mount(<IconButton icon="codicon-trash" label="Remover" busy onClick={onClick} />)
    act(() => button.click())
    expect(button.disabled).toBe(false)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Toggle', () => {
  it('reflects active in aria-pressed and in the on class, and accepts children', () => {
    const button = mount(
      <Toggle active label="Context" icon="codicon-eye" onClick={() => {}}>
        <span>text</span>
      </Toggle>
    )
    expect(button.className).toBe('toggle on')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.textContent).toBe('text')
  })
})
