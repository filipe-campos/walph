import { describe, expect, it } from 'vitest'
import { editTargetPath, proposeEdit } from './proposeEdit'

const edit = (extra: Record<string, unknown>) => ({ file_path: '/p/a.ts', ...extra })

describe('proposeEdit', () => {
  it('Edit replaces a single occurrence', () => {
    const r = proposeEdit('Edit', edit({ old_string: 'foo', new_string: 'bar' }), 'a foo b')
    expect(r).toEqual({ ok: true, path: '/p/a.ts', proposed: 'a bar b' })
  })

  it('Edit rejects a missing and an ambiguous old_string', () => {
    expect(proposeEdit('Edit', edit({ old_string: 'x', new_string: 'y' }), 'abc').ok).toBe(false)
    const dup = proposeEdit('Edit', edit({ old_string: 'a', new_string: 'b' }), 'a a')
    expect(dup).toEqual({ ok: false, reason: 'old_string appears more than once' })
  })

  it('Edit with replace_all replaces all', () => {
    const r = proposeEdit('Edit', edit({ old_string: 'a', new_string: 'b', replace_all: true }), 'a a a')
    expect(r).toMatchObject({ ok: true, proposed: 'b b b' })
  })

  it('does not interpret special patterns in new_string', () => {
    const r = proposeEdit('Edit', edit({ old_string: 'x', new_string: '$& $1' }), 'x')
    expect(r).toMatchObject({ proposed: '$& $1' })
  })

  it('MultiEdit applies in sequence and fails if one fails', () => {
    const ok = proposeEdit(
      'MultiEdit',
      edit({
        edits: [
          { old_string: 'a', new_string: 'b' },
          { old_string: 'b', new_string: 'c' }
        ]
      }),
      'a'
    )
    expect(ok).toMatchObject({ ok: true, proposed: 'c' })
    const bad = proposeEdit('MultiEdit', edit({ edits: [{ old_string: 'z', new_string: 'c' }] }), 'a')
    expect(bad.ok).toBe(false)
    expect(proposeEdit('MultiEdit', edit({ edits: [] }), 'a').ok).toBe(false)
  })

  it('Write returns the content, also for a new file', () => {
    expect(proposeEdit('Write', edit({ content: 'new' }), null)).toMatchObject({ ok: true, proposed: 'new' })
    expect(proposeEdit('Write', edit({}), null).ok).toBe(false)
  })

  it('Edit with an empty old_string only creates an empty/missing file', () => {
    expect(proposeEdit('Edit', edit({ old_string: '', new_string: 'x' }), null)).toMatchObject({ proposed: 'x' })
    expect(proposeEdit('Edit', edit({ old_string: '', new_string: 'x' }), 'content').ok).toBe(false)
  })

  it('keeps CRLF when old_string comes with LF', () => {
    const r = proposeEdit('Edit', edit({ old_string: 'a\nb', new_string: 'a\nc' }), 'a\r\nb\r\n')
    expect(r).toMatchObject({ ok: true, proposed: 'a\r\nc\r\n' })
  })

  it('rejects invalid inputs and tools that do not edit', () => {
    expect(proposeEdit('Edit', null, 'x').ok).toBe(false)
    expect(proposeEdit('Edit', { old_string: 'a', new_string: 'b' }, 'a').ok).toBe(false)
    expect(proposeEdit('Bash', edit({}), 'a').ok).toBe(false)
    expect(proposeEdit('Edit', edit({ old_string: 'a', new_string: 'a' }), 'a').ok).toBe(false)
  })

  it('editTargetPath', () => {
    expect(editTargetPath({ file_path: '/x' })).toBe('/x')
    expect(editTargetPath({ file_path: '' })).toBeNull()
    expect(editTargetPath(undefined)).toBeNull()
  })
})

describe('proposeEdit - gaps', () => {
  it('MultiEdit with replace_all replaces every occurrence of that edit', () => {
    const r = proposeEdit(
      'MultiEdit',
      edit({
        edits: [
          { old_string: 'a', new_string: 'b', replace_all: true },
          { old_string: 'x', new_string: 'y' }
        ]
      }),
      'a a x'
    )
    expect(r).toMatchObject({ ok: true, proposed: 'b b y' })
  })

  it('MultiEdit without replace_all rejects a repeated old_string', () => {
    const r = proposeEdit('MultiEdit', edit({ edits: [{ old_string: 'a', new_string: 'b' }] }), 'a a')
    expect(r.ok).toBe(false)
  })

  it('CRLF with replace_all and MultiEdit go back entirely to CRLF', () => {
    const all = proposeEdit(
      'Edit',
      edit({ old_string: 'x\ny', new_string: 'z', replace_all: true }),
      'x\r\ny\r\nx\r\ny\r\n'
    )
    expect(all).toMatchObject({ ok: true, proposed: 'z\r\nz\r\n' })
    const multi = proposeEdit(
      'MultiEdit',
      edit({
        edits: [
          { old_string: 'a\nb', new_string: 'a\nB' },
          { old_string: 'c', new_string: 'C' }
        ]
      }),
      'a\r\nb\r\nc\r\n'
    )
    expect(multi).toMatchObject({ ok: true, proposed: 'a\r\nB\r\nC\r\n' })
  })

  it('text with multibyte UTF-8 and a new file (original null)', () => {
    expect(proposeEdit('Edit', edit({ old_string: 'ção', new_string: '😀' }), 'ação')).toMatchObject({
      proposed: 'a😀'
    })
    expect(proposeEdit('Edit', edit({ old_string: 'a', new_string: 'b' }), null).ok).toBe(false)
  })

  it('CRLF does not mask a truly missing old_string', () => {
    expect(proposeEdit('Edit', edit({ old_string: 'q\nw', new_string: 'z' }), 'a\r\nb\r\n').ok).toBe(false)
  })
})
