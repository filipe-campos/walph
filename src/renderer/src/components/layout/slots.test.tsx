import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../../test/fakeApi'

installFakeApi()

const renders = { explorer: 0, panel: 0, claude: 0 }

vi.mock('../sidebar/Explorer', () => ({ Explorer: () => (renders.explorer++, null) }))
vi.mock('../sidebar/SearchView', () => ({ SearchView: () => null }))
vi.mock('../sidebar/GitView', () => ({ GitView: () => null }))
vi.mock('../BottomPanel', () => ({ BottomPanel: () => (renders.panel++, null) }))
vi.mock('../claude/ClaudePanel', () => ({ ClaudePanel: () => (renders.claude++, null) }))

const { useStore } = await import('../../store')
const { resizeSidebar, resizePanel, resizeClaude } = await import('../../layoutActions')
const { SidebarSlot } = await import('./SidebarSlot')
const { PanelSlot } = await import('./PanelSlot')
const { ClaudeSlot } = await import('./ClaudeSlot')

let root: Root | null = null
let host: HTMLElement

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
})

function mountAll(): void {
  host = document.createElement('div')
  root = createRoot(host)
  act(() =>
    root!.render(
      <>
        <SidebarSlot />
        <PanelSlot />
        <ClaudeSlot />
      </>
    )
  )
  renders.explorer = renders.panel = renders.claude = 0
}

describe('layout slots', () => {
  it('dragging the sidebar updates the width without re-rendering the view', () => {
    mountAll()
    act(() => resizeSidebar(10))
    expect(renders).toEqual({ explorer: 0, panel: 0, claude: 0 })
    expect(host.querySelector<HTMLElement>('.sidebar')!.style.width).toBe(`${useStore.getState().sidebarWidth}px`)
  })

  it('dragging the panel updates the height without re-rendering the view', () => {
    mountAll()
    act(() => resizePanel(-10))
    expect(renders).toEqual({ explorer: 0, panel: 0, claude: 0 })
    expect(host.querySelector<HTMLElement>('.panel-container')!.style.height).toBe(
      `${useStore.getState().panelHeight}px`
    )
  })

  it('dragging Claude updates the height without re-rendering the view', () => {
    mountAll()
    act(() => resizeClaude(-10))
    expect(renders).toEqual({ explorer: 0, panel: 0, claude: 0 })
    expect(host.querySelector<HTMLElement>('.claude-sidebar')!.style.width).toBe(`${useStore.getState().claudeWidth}px`)
  })
})
