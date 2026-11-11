import { act, useEffect } from 'react'
import type { ClaudeApi, ClaudeAttachmentFile, ClaudeAttachmentResult, FilesApi } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '../../test/fakeApi'
import { mount, settle, unmountAll } from '../../test/dom'

const pickAttachments = vi.fn<ClaudeApi['pickAttachments']>()
const authorizeAttachments = vi.fn<ClaudeApi['authorizeAttachments']>()
const pathForFile = vi.fn<FilesApi['pathForFile']>()
installFakeApi({ claude: { pickAttachments, authorizeAttachments }, files: { pathForFile } })

const { useAttachments } = await import('./useAttachments')
const { resetStore } = await import('../../test/resetStore')
const { toastTitles } = await import('../../test/toastTitles')

type Attachments = ReturnType<typeof useAttachments>

function Box({ focusInput, onState }: { focusInput: () => void; onState: (state: Attachments) => void }) {
  const attachments = useAttachments(focusInput)
  useEffect(() => {
    onState(attachments)
  })
  return <div id="zone" {...attachments.dropZone} onPaste={attachments.onPaste} />
}

function setup() {
  const focusInput = vi.fn()
  let latest: Attachments | null = null
  mount(<Box focusInput={focusInput} onState={(state) => (latest = state)} />)
  return { focusInput, hook: () => latest!, zone: document.getElementById('zone')! }
}

const result = (
  files: ClaudeAttachmentFile[],
  rejected: ClaudeAttachmentResult['rejected'] = []
): ClaudeAttachmentResult => ({
  files,
  rejected
})
const file = (name: string, size = 10, extra: Partial<ClaudeAttachmentFile> = {}): ClaudeAttachmentFile => ({
  path: `/r/${name}`,
  name,
  size,
  ...extra
})

interface Transfer {
  types: string[]
  files: File[]
  dropEffect: string
}

function fire(
  target: Element,
  type: string,
  init: { files?: File[]; types?: string[]; related?: Element | null; text?: string } = {}
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const files = init.files ?? []
  if (type === 'paste') {
    Object.assign(event, { clipboardData: { files, getData: () => init.text ?? '' } })
  } else {
    const dataTransfer: Transfer = { types: init.types ?? ['Files'], files, dropEffect: '' }
    Object.assign(event, { dataTransfer, relatedTarget: init.related ?? null })
  }
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

const image = (name: string, type = 'image/png', body = 'abc'): File => new File([body], name, { type })

beforeEach(() => {
  pickAttachments.mockResolvedValue(result([]))
  authorizeAttachments.mockResolvedValue(result([]))
  pathForFile.mockReturnValue('')
})

afterEach(() => {
  unmountAll()
  resetStore()
})

describe('picking files (paperclip)', () => {
  it('the validated files become chips and focus returns to the field', async () => {
    pickAttachments.mockResolvedValue(
      result([file('a.ts', 2048), file('b.png', 5, { image: { mediaType: 'image/png', data: 'AAAA' } })])
    )
    const { hook, focusInput } = setup()
    act(() => hook().attach())
    expect(focusInput).toHaveBeenCalledTimes(1)
    await settle()
    expect(hook().chips.map((c) => [c.kind, c.name, c.size])).toEqual([
      ['file', 'a.ts', 2048],
      ['image', 'b.png', 5]
    ])
  })

  it('the same path is not attached twice', async () => {
    pickAttachments.mockResolvedValue(result([file('a.ts')]))
    const { hook } = setup()
    act(() => hook().attach())
    await settle()
    act(() => hook().attach())
    await settle()
    expect(hook().chips).toHaveLength(1)
  })

  it('a file rejected by main becomes a notice and not a chip', async () => {
    pickAttachments.mockResolvedValue(result([], [{ name: 'large.bin', reason: 'exceeds 2 MB' }]))
    const { hook } = setup()
    act(() => hook().attach())
    await settle()
    expect(hook().chips).toEqual([])
    expect(toastTitles()).toEqual([expect.stringContaining('large.bin')])
    expect(toastTitles()[0]).toContain('exceeds 2 MB')
  })

  it('a dialog error becomes a notice and no chip', async () => {
    pickAttachments.mockRejectedValue(new Error('failed'))
    const { hook } = setup()
    act(() => hook().attach())
    await settle()
    expect(hook().chips).toEqual([])
    expect(toastTitles()).toEqual(['Claude: failed'])
  })

  it('removeChips removes only the requested keys', async () => {
    pickAttachments.mockResolvedValue(result([file('a.ts'), file('b.ts'), file('c.ts')]))
    const { hook } = setup()
    act(() => hook().attach())
    await settle()
    const [a, b, c] = hook().chips
    act(() => hook().removeChips(new Set([a.key, c.key])))
    expect(hook().chips.map((x) => x.key)).toEqual([b.key])
  })
})

describe('pasting an image', () => {
  it('an image becomes a chip with the base64 and the file name; with no text the paste is consumed', async () => {
    const { hook, zone } = setup()
    const event = fire(zone, 'paste', { files: [image('print.png', 'image/png', 'abc')] })
    await settle()
    expect(event.defaultPrevented).toBe(true)
    expect(hook().chips).toMatchObject([
      { kind: 'image', name: 'print.png', size: 3, image: { mediaType: 'image/png', data: 'YWJj' } }
    ])
  })

  it('an image without a name uses the label "imagem"', async () => {
    const { hook, zone } = setup()
    fire(zone, 'paste', { files: [image('')] })
    await settle()
    expect(hook().chips[0].name).toBe('imagem')
  })

  it('text pasted along with the image still goes to the field', async () => {
    const { hook, zone } = setup()
    const event = fire(zone, 'paste', { files: [image('a.png')], text: 'copied from a spreadsheet' })
    await settle()
    expect(event.defaultPrevented).toBe(false)
    expect(hook().chips).toHaveLength(1)
  })

  it('pasting without an image does nothing', async () => {
    const { hook, zone } = setup()
    const event = fire(zone, 'paste', { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] })
    await settle()
    expect(event.defaultPrevented).toBe(false)
    expect(hook().chips).toEqual([])
  })

  it('several images become several chips', async () => {
    const { hook, zone } = setup()
    fire(zone, 'paste', { files: [image('a.png'), image('b.jpg', 'image/jpeg')] })
    await settle()
    expect(hook().chips.map((c) => c.name)).toEqual(['a.png', 'b.jpg'])
  })

  it('an image above 5 MB notifies with the name and does not become a chip', async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' })
    const { hook, zone } = setup()
    fire(zone, 'paste', { files: [big] })
    await settle()
    expect(hook().chips).toEqual([])
    expect(toastTitles()).toEqual(['A imagem "huge.png" passa de 5 MB.'])
  })

  it('exactly 5 MB is still accepted', async () => {
    const edge = new File([new Uint8Array(5 * 1024 * 1024)], 'limit.png', { type: 'image/png' })
    const { hook, zone } = setup()
    fire(zone, 'paste', { files: [edge] })
    await settle()
    expect(hook().chips).toHaveLength(1)
  })

  it('a large image without a name is referred to as "colada"', async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], '', { type: 'image/png' })
    const { zone } = setup()
    fire(zone, 'paste', { files: [big] })
    await settle()
    expect(toastTitles()).toEqual(['A imagem "colada" passa de 5 MB.'])
  })

  it('a format other than PNG, JPEG, GIF and WebP notifies', async () => {
    const { hook, zone } = setup()
    fire(zone, 'paste', { files: [image('v.svg', 'image/svg+xml')] })
    await settle()
    expect(hook().chips).toEqual([])
    expect(toastTitles()).toEqual(['Formato de imagem não aceito (use PNG, JPEG, GIF ou WebP).'])
  })
})

describe('drag and drop', () => {
  it('dragging files over the box highlights it; leaving the box clears it; leaving to a child does not', () => {
    const { hook, zone } = setup()
    const child = zone.appendChild(document.createElement('span'))
    fire(zone, 'dragenter', { types: ['text/plain'] })
    expect(hook().dragging).toBe(false)
    fire(zone, 'dragenter')
    expect(hook().dragging).toBe(true)
    fire(zone, 'dragleave', { related: child })
    expect(hook().dragging).toBe(true)
    fire(zone, 'dragleave', { related: null })
    expect(hook().dragging).toBe(false)
  })

  it('dragover accepts files with the copy effect and ignores the rest', () => {
    const { zone } = setup()
    expect(fire(zone, 'dragover').defaultPrevented).toBe(true)
    expect(fire(zone, 'dragover', { types: ['text/plain'] }).defaultPrevented).toBe(false)
  })

  it('dropping files with a path asks main for authorization and attaches what comes back', async () => {
    pathForFile.mockImplementation((f) => `/disk/${f.name}`)
    authorizeAttachments.mockResolvedValue(result([file('a.ts'), file('b.ts')]))
    const { hook, zone, focusInput } = setup()
    fire(zone, 'dragenter')
    const event = fire(zone, 'drop', { files: [new File(['x'], 'a.ts'), new File(['y'], 'b.ts')] })
    await settle()
    expect(event.defaultPrevented).toBe(true)
    expect(hook().dragging).toBe(false)
    expect(authorizeAttachments).toHaveBeenCalledExactlyOnceWith(['/disk/a.ts', '/disk/b.ts'])
    expect(hook().chips.map((c) => c.name)).toEqual(['a.ts', 'b.ts'])
    expect(focusInput).toHaveBeenCalledTimes(1)
  })

  it('dropping without files is not consumed', () => {
    const { zone, hook } = setup()
    fire(zone, 'dragenter')
    const event = fire(zone, 'drop', { types: ['text/plain'] })
    expect(event.defaultPrevented).toBe(false)
    expect(hook().dragging).toBe(false)
    expect(authorizeAttachments).not.toHaveBeenCalled()
  })

  it('an image without a path (dragged from a page) is read by the FileReader', async () => {
    const { hook, zone } = setup()
    fire(zone, 'drop', { files: [image('web.webp', 'image/webp')] })
    await settle()
    expect(authorizeAttachments).not.toHaveBeenCalled()
    expect(hook().chips).toMatchObject([{ kind: 'image', name: 'web.webp', image: { mediaType: 'image/webp' } }])
  })

  it('a regular file without a path notifies that it is not on disk', async () => {
    const { hook, zone } = setup()
    fire(zone, 'drop', { files: [new File(['x'], 'note.txt', { type: 'text/plain' })] })
    await settle()
    expect(hook().chips).toEqual([])
    expect(toastTitles()).toEqual(['Não foi possível anexar "note.txt": o arquivo não está no disco.'])
  })

  it('mixed: those with a path go to main, the image without a path enters directly and the rest notify', async () => {
    pathForFile.mockImplementation((f) => (f.name === 'a.ts' ? '/disk/a.ts' : ''))
    authorizeAttachments.mockResolvedValue(result([file('a.ts')]))
    const { hook, zone } = setup()
    fire(zone, 'drop', {
      files: [
        new File(['x'], 'a.ts'),
        image('w.png'),
        new File(['z'], 'loose.bin', { type: 'application/octet-stream' })
      ]
    })
    await settle()
    expect(authorizeAttachments).toHaveBeenCalledWith(['/disk/a.ts'])
    expect(
      hook()
        .chips.map((c) => c.name)
        .sort()
    ).toEqual(['a.ts', 'w.png'])
    expect(toastTitles()).toHaveLength(1)
  })
})
