import type { WebContents } from 'electron'
import { activeContents, hostOf } from '../window/windows'

/** The view is the visible workspace of its window (an unknown view is treated as active). */
export function isActiveView(wc: WebContents): boolean {
  const host = hostOf(wc)
  return !host || activeContents(host) === wc
}
