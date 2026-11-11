import type { GitStatus } from '@shared/types'
import { dirname, isInside } from './path'

export type Decoration = 'modified' | 'added' | 'deleted' | 'untracked' | 'conflict'

export function decorationOf(index: string, work: string): Decoration {
  if (index === 'U' || work === 'U' || (index === 'A' && work === 'A') || (index === 'D' && work === 'D'))
    return 'conflict'
  if (index === '?') return 'untracked'
  if (index === 'A') return 'added'
  if (index === 'D' || work === 'D') return 'deleted'
  return 'modified'
}

export function decorationBadge(deco: Decoration): string {
  return { modified: 'M', added: 'A', deleted: 'D', untracked: 'U', conflict: '!' }[deco]
}

export function buildDecorations(git: GitStatus | null, root: string): Map<string, Decoration> {
  const map = new Map<string, Decoration>()
  if (!git?.isRepo) return map
  for (const f of git.files) {
    const deco = decorationOf(f.index, f.workingDir)
    map.set(f.path, deco)
    // Folders inherit a mark to show that there are changes inside them.
    // An already marked folder = already marked ancestors: stopping here keeps the cost per folder, not per file ×
    // depth.
    for (let dir = dirname(f.path); isInside(root, dir) && dir !== root; dir = dirname(dir)) {
      if (map.has(dir)) break
      map.set(dir, deco === 'deleted' ? 'modified' : deco)
    }
  }
  return map
}
