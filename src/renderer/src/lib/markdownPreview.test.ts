import { beforeAll, describe, expect, it } from 'vitest'
import {
  assignHeadingSlugs,
  findAnchorTarget,
  isMarkdownPath,
  renderMarkdownHtml,
  resolveImage,
  resolveLink,
  slugify
} from './markdownPreview'
import { loadMarkdownLibs, markdownLibs } from './markdownLibs'

beforeAll(async () => {
  await loadMarkdownLibs()
})

function dom(markdown: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = renderMarkdownHtml(markdown)
  return el
}

describe('renderMarkdownHtml: sanitization', () => {
  it('removes script, iframe, object, embed, form and style', () => {
    const el = dom(
      [
        '# Hi',
        '<script>alert(1)</script>',
        '<iframe src="https://x.test"></iframe>',
        '<object data="x"></object>',
        '<embed src="x">',
        '<form action="/x"><input name="a"><button>ok</button></form>',
        '<style>body{display:none}</style>',
        'text'
      ].join('\n\n')
    )
    for (const tag of ['script', 'iframe', 'object', 'embed', 'form', 'style', 'button'])
      expect(el.querySelector(tag), tag).toBeNull()
    expect(el.textContent).toContain('text')
    expect(el.querySelector('h1')?.textContent).toBe('Hi')
  })

  it('removes on* and style attributes', () => {
    const el = dom(
      '<p onclick="x()" style="color:red" onmouseover="y()">a</p>\n\n<img src="a.png" onerror="z()" alt="a">'
    )
    expect(el.innerHTML).not.toMatch(/onclick|onerror|onmouseover|style=/i)
  })

  it('leaves no live href/src: links and images become data-raw-*', () => {
    const el = dom('[ver](docs/a.md) ![logo](img/l.png "t")')
    const a = el.querySelector('a')!
    expect(a.hasAttribute('href')).toBe(false)
    expect(a.getAttribute('data-raw-href')).toBe('docs/a.md')
    const img = el.querySelector('img')!
    expect(img.hasAttribute('src')).toBe(false)
    expect(img.getAttribute('data-raw-src')).toBe('img/l.png')
    expect(img.getAttribute('alt')).toBe('logo')
  })

  it('javascript: links lose the target', () => {
    const el = dom('[x](javascript:alert(1)) <a href="javascript:alert(2)">y</a>')
    for (const a of el.querySelectorAll('a')) expect(a.getAttribute('data-raw-href') ?? '').not.toMatch(/javascript/i)
  })

  it('ignores forged data-* and id and the document classes', () => {
    const el = dom(
      '<div class="modal-backdrop" id="root" data-raw-href="x" data-slug="y">a</div>\n\n<a href="#a" data-raw-href="https://evil.test">b</a>'
    )
    const div = el.querySelector('div')!
    expect(div.hasAttribute('class')).toBe(false)
    expect(div.hasAttribute('id')).toBe(false)
    expect(div.hasAttribute('data-raw-href')).toBe(false)
    expect(div.hasAttribute('data-slug')).toBe(false)
    expect(el.querySelector('a')!.getAttribute('data-raw-href')).toBe('#a')
  })

  it('keeps only the language-* class of fences', () => {
    const el = dom('```ts\nconst a = 1\n```')
    const code = el.querySelector('pre > code')!
    expect(code.className).toBe('language-ts')
  })

  it('a task list becomes an inert checkbox', () => {
    const el = dom('- [x] feito\n- [ ] falta\n\n<input type="text" value="x" onfocus="y()">')
    const inputs = [...el.querySelectorAll('input')]
    expect(inputs.length).toBeGreaterThan(0)
    for (const input of inputs) {
      expect(input.getAttribute('type')).toBe('checkbox')
      expect(input.hasAttribute('disabled')).toBe(true)
      expect(input.hasAttribute('onfocus')).toBe(false)
    }
  })

  it('removes maps, areas and attributes that load resources outside readImage', () => {
    const el = dom(
      '<table><tr><td background="/abs/p.png" ping="https://x.test">a</td></tr></table>\n\n<map name="m"><area href="https://x.test" shape="rect"></map>\n\n<img usemap="#m" alt="a">'
    )
    expect(el.querySelector('map, area')).toBeNull()
    expect(el.innerHTML).not.toMatch(/background=|ping=|usemap=/i)
  })

  it('renders GFM (table)', () => {
    const el = dom('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(el.querySelectorAll('td')).toHaveLength(2)
  })
})

describe('resolveLink', () => {
  const md = '/repo/docs/guia.md'

  it('anchor in the same document', () => {
    expect(resolveLink('#instalação', md)).toEqual({ kind: 'anchor', id: 'instalação' })
    expect(resolveLink('#inst%C3%A1', md)).toEqual({ kind: 'anchor', id: 'instá' })
  })

  it('path relative to the .md folder, with .. and ./', () => {
    expect(resolveLink('other.md', md)).toEqual({ kind: 'file', path: '/repo/docs/other.md' })
    expect(resolveLink('./sub/x.ts', md)).toEqual({ kind: 'file', path: '/repo/docs/sub/x.ts' })
    expect(resolveLink('../README.md', md)).toEqual({ kind: 'file', path: '/repo/README.md' })
    expect(resolveLink('../../../../x', md)).toEqual({ kind: 'file', path: '/x' })
  })

  it('file with an anchor and with a query', () => {
    expect(resolveLink('other.md#top', md)).toEqual({ kind: 'file', path: '/repo/docs/other.md', anchor: 'top' })
    expect(resolveLink('a.md?plain=1', md)).toEqual({ kind: 'file', path: '/repo/docs/a.md' })
    expect(resolveLink('with%20space.md', md)).toEqual({ kind: 'file', path: '/repo/docs/with space.md' })
  })

  it('absolute path', () => {
    expect(resolveLink('/etc/x.md', md)).toEqual({ kind: 'file', path: '/etc/x.md' })
  })

  it('http(s) and mailto are external', () => {
    expect(resolveLink('https://example.com/a#b', md)).toEqual({ kind: 'external', url: 'https://example.com/a#b' })
    expect(resolveLink('HTTP://example.com', md)).toEqual({ kind: 'external', url: 'HTTP://example.com' })
    expect(resolveLink('mailto:a@b.c', md)).toEqual({ kind: 'external', url: 'mailto:a@b.c' })
  })

  it('the rest is ignored', () => {
    for (const href of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,x',
      'vscode://x',
      '//host/x',
      '',
      '   ',
      null
    ])
      expect(resolveLink(href, md)).toEqual({ kind: 'ignore' })
  })

  it('works with Windows paths', () => {
    const win = 'C:\\repo\\docs\\guia.md'
    expect(resolveLink('..\\README.md', win)).toEqual({ kind: 'file', path: 'C:\\repo\\README.md' })
    expect(resolveLink('img/a.md', win)).toEqual({ kind: 'file', path: 'C:\\repo\\docs\\img\\a.md' })
    expect(resolveLink('../../../x.md', win)).toEqual({ kind: 'file', path: 'C:\\x.md' })
  })
})

describe('resolveImage', () => {
  const md = '/repo/README.md'

  it('relative to the .md folder', () => {
    expect(resolveImage('img/logo.png', md)).toEqual({ kind: 'local', path: '/repo/img/logo.png' })
    expect(resolveImage('../fora.png', md)).toEqual({ kind: 'local', path: '/fora.png' })
    expect(resolveImage('a%20b.png?raw=1#x', md)).toEqual({ kind: 'local', path: '/repo/a b.png' })
  })

  it('absolute', () => {
    expect(resolveImage('/repo/assets/x.png', md)).toEqual({ kind: 'local', path: '/repo/assets/x.png' })
  })

  it('remote ones are never loaded', () => {
    expect(resolveImage('https://x.test/a.png', md)).toEqual({ kind: 'remote' })
    expect(resolveImage('http://x.test/a.png', md)).toEqual({ kind: 'remote' })
    expect(resolveImage('//x.test/a.png', md)).toEqual({ kind: 'remote' })
    expect(resolveImage('file:///etc/passwd', md)).toEqual({ kind: 'remote' })
  })

  it('an embedded raster image passes; embedded svg and html do not', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    expect(resolveImage(png, md)).toEqual({ kind: 'inline', url: png })
    expect(resolveImage('data:image/svg+xml;base64,PHN2Zz4=', md)).toEqual({ kind: 'remote' })
    expect(resolveImage('data:text/html;base64,PGI+', md)).toEqual({ kind: 'remote' })
  })

  it('empty has no image', () => {
    expect(resolveImage('', md)).toEqual({ kind: 'none' })
    expect(resolveImage(undefined, md)).toEqual({ kind: 'none' })
  })
})

describe('heading anchors', () => {
  it('slugify like GitHub', () => {
    expect(slugify('Instalação e Uso')).toBe('instalação-e-uso')
    expect(slugify('API: `open()` — v2!')).toBe('api-open--v2')
  })

  it('repeated headings get a suffix and the anchor is found case-insensitively', () => {
    const el = dom('# Uso\n\n## Uso\n\n## Outro Título')
    assignHeadingSlugs(el)
    expect([...el.querySelectorAll('h1,h2')].map((h) => h.getAttribute('data-slug'))).toEqual([
      'uso',
      'uso-1',
      'outro-título'
    ])
    expect(findAnchorTarget(el, 'Outro-Título')?.textContent).toBe('Outro Título')
    expect(findAnchorTarget(el, 'nao-existe')).toBeNull()
  })
})

describe('isMarkdownPath', () => {
  it('recognizes .md and .mdx', () => {
    expect(isMarkdownPath('/a/README.md')).toBe(true)
    expect(isMarkdownPath('/a/pagina.MDX')).toBe(true)
    expect(isMarkdownPath('/a/x.markdown')).toBe(false)
    expect(isMarkdownPath('/a/md')).toBe(false)
  })
})

describe('renderMarkdownHtml: KaTeX, alerts and footnotes', () => {
  it('renders formulas in HTML (no MathML) keeping the KaTeX classes and measures', () => {
    const el = dom('See $x^2$ here\n\n$$\\sqrt{a} + \\frac{a}{b}$$')
    expect(el.querySelectorAll('.katex').length).toBe(2)
    expect(el.querySelector('math')).toBeNull()
    expect(el.querySelector('.katex .vlist[style]')).not.toBeNull()
    expect(el.querySelector('.katex svg')).not.toBeNull()
  })

  it('every class generated by KaTeX is accepted by the sanitizer', () => {
    const formula =
      '\\sqrt[3]{x} \\frac{a}{b} \\sum_{i=0}^n \\overline{x} \\hat{y} \\mathbb{R} \\begin{matrix}a&b\\\\c&d\\end{matrix} \\text{ok} \\left(x\\right) \\xrightarrow{a} \\cancel{x} \\boxed{y}'
    const el = dom(`$$${formula}$$`)
    const raw = markdownLibs()!.preview.parse(`$$${formula}$$`, { async: false })
    const holder = document.createElement('div')
    holder.innerHTML = raw
    const expected = new Set([...holder.querySelectorAll('[class]')].flatMap((n) => [...n.classList]))
    const got = new Set([...el.querySelectorAll('[class]')].flatMap((n) => [...n.classList]))
    expect([...expected].filter((c) => !got.has(c))).toEqual([])
  })

  it('document classes and style outside KaTeX stay forbidden', () => {
    const el = dom(
      '<div class="modal-backdrop" style="position:fixed">x</div>\n\n<span class="katex"><b class="modal-backdrop" style="position:fixed;top:0">y</b></span>'
    )
    expect(el.querySelector('.modal-backdrop')).toBeNull()
    expect(el.querySelector('[style]')).toBeNull()
  })

  it('svg outside KaTeX is removed', () => {
    expect(dom('<svg width="10" height="10"><path d="M0 0"/></svg>').querySelector('svg')).toBeNull()
  })

  it('GitHub alerts get the markdown-alert classes', () => {
    const el = dom('> [!WARNING]\n> cuidado')
    expect(el.querySelector('div.markdown-alert.markdown-alert-warning')).not.toBeNull()
    expect(el.querySelector('p.markdown-alert-title')).not.toBeNull()
    expect(el.querySelector('svg')).toBeNull()
  })

  it('footnotes: the reference and the note point to each other by data-slug, without id', () => {
    const el = dom('Text[^1]\n\n[^1]: note')
    expect(el.querySelector('section.footnotes')).not.toBeNull()
    expect(el.querySelector('[id]')).toBeNull()
    const ref = el.querySelector('sup a')!
    expect(ref.getAttribute('data-raw-href')).toBe('#footnote-1')
    expect(findAnchorTarget(el, 'footnote-1')?.tagName).toBe('LI')
    const back = el.querySelector('li a')!
    expect(findAnchorTarget(el, back.getAttribute('data-raw-href')!.slice(1))?.tagName).toBe('A')
  })
})
