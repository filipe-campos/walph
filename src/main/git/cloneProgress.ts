import type { GitCloneProgress } from '@shared/types'
import { t, type Messages } from '@shared/i18n'

// `git clone --progress` writes progress to stderr, with `\r` between updates of the same line
// ("Receiving objects:  45% (450/1000), 1.2 MiB | 2.0 MiB/s\r"). Here live the line splitting and stage translation.

export type CloneProgressStep = Pick<GitCloneProgress, 'stage' | 'percent'>

type StageKey = keyof Messages['git']['clone']['stages']

const STAGES: ReadonlyArray<readonly [RegExp, StageKey]> = [
  [/^enumerating objects/i, 'enumerating'],
  [/^counting objects/i, 'counting'],
  [/^compressing objects/i, 'compressing'],
  [/^receiving objects/i, 'receiving'],
  [/^resolving deltas/i, 'resolving'],
  [/^(updating|checking out) files/i, 'updating']
]

/** Initial stage, before git's first line. */
export const cloneStartStep = (): CloneProgressStep => ({ stage: t().git.clone.stages.connecting, percent: null })

/**
 * Parses a progress line. `null` for what is not a known stage (e.g. "Cloning into 'x'...", "warning:").
 * Stages without a percentage (e.g. "Enumerating objects: 10, done.") come back with `percent: null`.
 */
export function parseCloneProgressLine(line: string): CloneProgressStep | null {
  const text = line.trim().replace(/^remote:\s*/i, '')
  const stage = STAGES.find(([re]) => re.test(text))
  if (!stage) return null
  const label = t().git.clone.stages[stage[1]]
  const match = /:\s+(\d{1,3})%/.exec(text)
  if (!match) return { stage: label, percent: null }
  return { stage: label, percent: Math.min(100, Number(match[1])) }
}

/**
 * Splits the stderr stream into lines (`\r` or `\n` end one). Returns the complete lines and the rest without a
 * terminator, which must be passed back along with the next chunk.
 */
export function splitProgressChunk(pending: string, chunk: string): { lines: string[]; rest: string } {
  const parts = (pending + chunk).split(/[\r\n]+/)
  const rest = parts.pop() ?? ''
  return { lines: parts.filter((l) => l.length > 0), rest }
}

/** Progress lines and the opening one stay out of the error message. */
export function isProgressNoise(line: string): boolean {
  return /^cloning into /i.test(line.trim()) || parseCloneProgressLine(line) !== null
}

/** Two equal stages need no new event (git repeats the line on every rate update). */
export function sameStep(a: CloneProgressStep | null, b: CloneProgressStep): boolean {
  return !!a && a.stage === b.stage && a.percent === b.percent
}
