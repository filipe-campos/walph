import { describe, expect, it } from 'vitest'
import { buildExplorerMenu, parseSelectionCount } from './explorerMenu'

const base = { isDir: false, canPaste: true, canCompare: true, selectionCount: 1, platform: 'linux' as const }
const find = (items: ReturnType<typeof buildExplorerMenu>, value: string) =>
  items.find((i) => 'value' in i && i.value === value)

describe('parseSelectionCount', () => {
  it.each([undefined, null, 0, -2, 1.5, NaN, Infinity, '3', {}])('%s becomes 1', (raw) => {
    expect(parseSelectionCount(raw)).toBe(1)
  })
  it('accepts an integer >= 1', () => {
    expect(parseSelectionCount(4)).toBe(4)
  })
})

describe('buildExplorerMenu', () => {
  it('one item: everything enabled and the plain trash label', () => {
    const items = buildExplorerMenu(base)
    expect(find(items, 'rename')).toMatchObject({ enabled: true })
    expect(find(items, 'delete')).toMatchObject({ label: 'Mover para a Lixeira' })
    expect(find(items, 'compareWithSelected')).toMatchObject({ enabled: true })
  })

  it('several items: disables rename, compare and reveal; shows the count in the trash label', () => {
    const items = buildExplorerMenu({ ...base, selectionCount: 3 })
    for (const v of ['rename', 'reveal', 'selectForCompare', 'compareWithSelected']) {
      expect(find(items, v)).toMatchObject({ enabled: false })
    }
    expect(find(items, 'delete')).toMatchObject({ label: 'Mover 3 itens para a Lixeira' })
    expect(find(items, 'copy')).not.toHaveProperty('enabled', false)
  })

  it('several items in a folder: disables create', () => {
    const items = buildExplorerMenu({ ...base, isDir: true, selectionCount: 2 })
    expect(find(items, 'newFile')).toMatchObject({ enabled: false })
    expect(find(items, 'newFolder')).toMatchObject({ enabled: false })
  })
})
