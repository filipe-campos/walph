import { describe, expect, it } from 'vitest'
import { COMMAND_IDS, defaultKeybindings, isChord } from '@shared/commands'
import { canonical } from './userKeybindings'
import { whenTextsDisjoint } from './when'

const IDS = COMMAND_IDS
const PLATFORMS = ['darwin', 'win32', 'linux']

describe('default shortcuts x main normalization and when', () => {
  it.each(PLATFORMS)('the same key in two shortcuts only with disjoint whens on %s', (platform) => {
    const norm = (k: string): string => canonical(k, platform)
    const all = IDS.flatMap((id) =>
      defaultKeybindings(id, platform).map((b) => ({ id, key: norm(b.key), when: b.when }))
    )
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]
        const b = all[j]
        if (a.key !== b.key) continue
        expect(whenTextsDisjoint(a.when, b.when), `${a.id} (${a.when}) x ${b.id} (${b.when}) on ${a.key}`).toBe(true)
      }
    }
  })

  it.each(PLATFORMS)('the 1st stroke of a chord does not collide with a single-stroke shortcut on %s', (platform) => {
    const norm = (k: string): string => canonical(k, platform)
    const all = IDS.flatMap((id) => defaultKeybindings(id, platform).map((b) => ({ key: norm(b.key), when: b.when })))
    const chords = all.filter((b) => isChord(b.key))
    const singles = all.filter((b) => !isChord(b.key))
    for (const chord of chords) {
      for (const single of singles) {
        if (single.key !== chord.key.split(' ')[0]) continue
        expect(whenTextsDisjoint(chord.when, single.when), chord.key).toBe(true)
      }
    }
  })
})

describe('explorer and terminal shortcuts', () => {
  it.each(PLATFORMS)('copy, cut and paste only apply with focus in the explorer on %s', (platform) => {
    for (const id of ['explorer.copy', 'explorer.cut', 'explorer.paste'] as const) {
      const [binding] = defaultKeybindings(id, platform)
      expect(binding?.when).toBe('explorerFocus')
      for (const focus of ['terminalFocus', 'editorFocus', 'claudeFocus', 'markdownPreviewFocus']) {
        expect(whenTextsDisjoint(binding?.when, focus), `${id} x ${focus}`).toBe(true)
      }
    }
  })

  it.each(PLATFORMS)('no default shortcut steals the shell editing keys in the terminal on %s', (platform) => {
    const reserved = ['Cmd+Backspace', 'Cmd+Left', 'Cmd+Right', 'Alt+Left', 'Alt+Right', 'Alt+Backspace'].map((k) =>
      canonical(k, platform)
    )
    for (const id of IDS) {
      for (const binding of defaultKeybindings(id, platform)) {
        if (!reserved.includes(canonical(binding.key, platform))) continue
        expect(whenTextsDisjoint(binding.when, 'terminalFocus'), `${id} ${binding.key}`).toBe(true)
      }
    }
  })
})
