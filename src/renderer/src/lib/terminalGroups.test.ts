import { describe, expect, it } from 'vitest'
import {
  displayTitle,
  groupIds,
  groupLabel,
  insertAfter,
  membersOf,
  normalizeCustomTitle,
  removeTerminalFrom,
  type GroupedTerminal
} from './terminalGroups'

const t = (id: string, groupId: string, title = id, customTitle?: string): GroupedTerminal => ({
  id,
  groupId,
  title,
  customTitle
})

describe('terminalGroups', () => {
  const list = [t('a', 'g1', 'zsh'), t('b', 'g1', 'htop'), t('c', 'g2', 'zsh', 'build')]

  it('displayed title: the custom one wins over the automatic one', () => {
    expect(displayTitle(list[0])).toBe('zsh')
    expect(displayTitle(list[2])).toBe('build')
  })

  it('groups in order of appearance and labels with the titles', () => {
    expect(groupIds(list)).toEqual(['g1', 'g2'])
    expect(membersOf(list, 'g1').map((x) => x.id)).toEqual(['a', 'b'])
    expect(groupLabel(list, 'g1')).toBe('zsh, htop')
    expect(groupLabel(list, 'g2')).toBe('build')
  })

  it('inserts the new one right after the source one', () => {
    expect(insertAfter(list, 'a', t('n', 'g1')).map((x) => x.id)).toEqual(['a', 'n', 'b', 'c'])
    expect(insertAfter(list, 'zzz', t('n', 'g1')).map((x) => x.id)).toEqual(['a', 'b', 'c', 'n'])
  })

  it('removing the active one prefers the group neighbor (previous, else next)', () => {
    expect(removeTerminalFrom(list, 'b', 'b')).toMatchObject({ activeId: 'a' })
    expect(removeTerminalFrom(list, 'a', 'a')).toMatchObject({ activeId: 'b' })
  })

  it('removing the last of the group activates the last remaining one', () => {
    const r = removeTerminalFrom(list, 'c', 'c')
    expect(r.activeId).toBe('b')
    expect(r.terminals.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('removing another terminal keeps the active one; removing the only one clears it', () => {
    expect(removeTerminalFrom(list, 'a', 'c').activeId).toBe('c')
    expect(removeTerminalFrom([t('x', 'g')], 'x', 'x')).toEqual({ terminals: [], activeId: null })
    expect(removeTerminalFrom(list, 'nao-existe', 'a').terminals).toHaveLength(3)
  })

  it('normalizes the typed name', () => {
    expect(normalizeCustomTitle('  servidor  ')).toBe('servidor')
    expect(normalizeCustomTitle('   ')).toBeUndefined()
    expect(normalizeCustomTitle('a\nb')).toBe('a b')
    expect(normalizeCustomTitle('x'.repeat(100))).toHaveLength(64)
  })
})
