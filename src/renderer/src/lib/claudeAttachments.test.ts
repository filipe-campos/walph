import { describe, expect, it } from 'vitest'
import { addChips, chipFromFile, formatFileSize, mergeAttachments, type Chip } from './claudeAttachments'

describe('formatFileSize', () => {
  it('formats B, KB and MB', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(formatFileSize(20 * 1024 * 1024)).toBe('20 MB')
  })
})

describe('chips', () => {
  const file = chipFromFile({ path: '/p/a.ts', name: 'a.ts', size: 10 })
  const image = chipFromFile({
    path: '/p/a.png',
    name: 'a.png',
    size: 10,
    image: { mediaType: 'image/png', data: 'x' }
  })

  it('an image becomes a thumbnail and a file keeps the path', () => {
    expect(image.kind).toBe('image')
    expect(file.kind).toBe('file')
  })
  it('does not repeat the same path', () => {
    const list = addChips([file], [chipFromFile({ path: '/p/a.ts', name: 'a.ts', size: 10 }), image])
    expect(list).toHaveLength(2)
  })
  it('merges with mentions without duplicating a whole file', () => {
    const chips: Chip[] = [file, image]
    const files = chips.flatMap((c) => (c.kind === 'file' ? [{ path: c.path }] : []))
    expect(mergeAttachments(files, [{ path: '/p/a.ts' }])).toEqual([{ path: '/p/a.ts' }])
    expect(mergeAttachments(files, [{ path: '/p/a.ts', startLine: 1, endLine: 2 }])).toEqual([
      { path: '/p/a.ts', startLine: 1, endLine: 2 },
      { path: '/p/a.ts' }
    ])
  })
})
