import { beforeEach, describe, expect, it, vi } from 'vitest'

const initialize = vi.fn()
const render = vi.fn<(id: string, source: string) => Promise<{ svg: string }>>()
vi.mock('mermaid', () => ({ default: { initialize, render } }))

const { renderDiagrams } = await import('./markdownDiagrams')

const block = (source: string): string => `<pre><code class="language-mermaid">${source}</code></pre>`
function root(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.append(el)
  return el
}

let counter = 0
// Unique sources per test: the SVG cache belongs to the module.
const src = (): string => `graph TD; A${counter++}-->B`

beforeEach(() => {
  initialize.mockClear()
  render.mockReset()
  render.mockImplementation(async (_id, source) => ({ svg: `<svg><text>${source}</text></svg>` }))
})

describe('renderDiagrams', () => {
  it('replaces the mermaid block with the SVG and leaves the other blocks', async () => {
    const s = src()
    const el = root(block(s) + '<pre><code class="language-ts">x</code></pre>')
    await renderDiagrams(el, 'dark')
    expect(el.querySelector('svg text')?.textContent).toBe(s)
    expect(el.querySelector('code.language-mermaid')).toBeNull()
    expect(el.querySelector('code.language-ts')).not.toBeNull()
  })

  it('initializes in strict mode and only again when the theme changes', async () => {
    await renderDiagrams(root(block(src())), 'light')
    await renderDiagrams(root(block(src())), 'light')
    const calls = initialize.mock.calls.map(([cfg]) => cfg)
    expect(calls.at(-1)).toMatchObject({ securityLevel: 'strict', theme: 'default' })
    await renderDiagrams(root(block(src())), 'dark')
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }))
  })

  it('the same text and theme come from the cache: no new render and no waiting', async () => {
    const s = src()
    await renderDiagrams(root(block(s)), 'dark')
    render.mockClear()
    const again = root(block(s))
    const pending = renderDiagrams(again, 'dark')
    expect(again.querySelector('.md-diagram svg')).not.toBeNull()
    await pending
    expect(render).not.toHaveBeenCalled()
    await renderDiagrams(root(block(s)), 'light')
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('shows the error in place of the block and does not keep the failure in the cache', async () => {
    const s = src()
    render.mockRejectedValueOnce(new Error('Parse error on line 1'))
    const el = root(block(s))
    await renderDiagrams(el, 'dark')
    expect(el.querySelector('.md-diagram-error')?.textContent).toContain('Parse error on line 1')
    expect(el.querySelector('.md-diagram-error')?.textContent).toContain('Não foi possível desenhar o diagrama.')
    const retry = root(block(s))
    await renderDiagrams(retry, 'dark')
    expect(retry.querySelector('.md-diagram svg')).not.toBeNull()
  })

  it('a late reply for content already replaced is dropped', async () => {
    const s = src()
    let release!: (v: { svg: string }) => void
    render.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    const el = root(block(s))
    const pending = renderDiagrams(el, 'dark')
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    el.innerHTML = '<p>new</p>'
    release({ svg: '<svg></svg>' })
    await pending
    expect(el.querySelector('svg')).toBeNull()
    expect(el.textContent).toBe('new')
  })

  it('the SVG goes through the sanitizer: no script, link, handler, app class or positioning', async () => {
    render.mockImplementationOnce(async (id) => ({
      svg:
        `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" onload="x()"><style>#${id} .a{fill:red;position:fixed}</style>` +
        '<script>alert(1)</script><a href="javascript:x()"><text>l</text></a><use href="#a"/>' +
        '<foreignObject><div class="nodeLabel modal-backdrop" style="position:fixed;top:0;color:red" onclick="x()">' +
        '<span class="tree-row">hi</span></div></foreignObject></svg>'
    }))
    const el = root(block(src()))
    await renderDiagrams(el, 'dark')
    const box = el.querySelector('.md-diagram')!
    expect(box.querySelector('script, a, use')).toBeNull()
    expect(box.querySelector('[onload], [onclick]')).toBeNull()
    expect(box.querySelector('.modal-backdrop, .tree-row')).toBeNull()
    expect(box.querySelector('.nodeLabel')).not.toBeNull()
    expect(box.innerHTML, box.innerHTML).not.toMatch(/position/i)
    expect(box.querySelector('div')?.getAttribute('style')).toContain('color:red')
  })

  it('the same text in two places does not repeat ids and renders only once in parallel', async () => {
    const s = src()
    render.mockImplementation(async (id) => ({ svg: `<svg id="${id}"><marker id="${id}_m"></marker></svg>` }))
    const a = root(block(s))
    const b = root(block(s))
    await Promise.all([renderDiagrams(a, 'dark'), renderDiagrams(b, 'dark')])
    expect(render).toHaveBeenCalledTimes(1)
    const ids = [...a.querySelectorAll('[id]'), ...b.querySelectorAll('[id]')].map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('changing the theme redraws the already inserted diagram', async () => {
    const s = src()
    const el = root(block(s))
    await renderDiagrams(el, 'dark')
    await renderDiagrams(el, 'light')
    expect(el.querySelector('.md-diagram')?.getAttribute('data-diagram-theme')).toBe('light')
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'default' }))
  })

  it('without mermaid blocks loads nothing', async () => {
    await renderDiagrams(root('<p>hi</p>'), 'dark')
    expect(render).not.toHaveBeenCalled()
  })
})
