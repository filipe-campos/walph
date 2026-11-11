// "Always in this workspace": `allow` rules suggested by the CLI written to `<folder>/.claude/settings.local.json`
// (a file the CLI itself reads: `settingSources` includes `local`). Here only the pure logic (finding the rules,
// merging into the existing JSON without deleting anything and redirecting the suggestions to the session), plus the
// queued write (`saveWorkspaceRules`).

import { isRecord } from '@shared/guards'
import { t } from '@shared/i18n'
import { join } from 'node:path'
import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk'
import { resolveInsideRoot } from '../fs/paths'
import { SerialQueue } from '../util/serialQueue'
import { ensureLocalSettingsIgnored } from './gitExclude'
import { readTextOrNull, writeTextAtomic } from './safePath'
import { UserError } from '../errors'

/** Cap on the `settings.local.json` we read to merge a rule (the CLI writes nothing close to it). */
const MAX_LOCAL_SETTINGS_BYTES = 1024 * 1024
const MAX_RULES = 50
const MAX_TOOL_NAME = 200
const MAX_RULE_CONTENT = 2000

/** Same shape as the CLI: `Tool` or `Tool(content)`, with `\`, `(` and `)` of the content escaped. */
export function ruleString(toolName: string, ruleContent?: string): string {
  if (ruleContent === undefined || ruleContent === '') return toolName
  const escaped = ruleContent.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  return `${toolName}(${escaped})`
}

/** Unique `allow` rules from the CLI suggestions, already as text. Other types/`deny`/`ask` suggestions are ignored. */
export function allowRulesOf(suggestions: readonly PermissionUpdate[] | undefined): string[] {
  const rules = new Set<string>()
  for (const s of suggestions ?? []) {
    if (!isRecord(s) || s.type !== 'addRules' || s.behavior !== 'allow' || !Array.isArray(s.rules)) continue
    for (const r of s.rules as unknown[]) {
      if (!isRecord(r) || typeof r.toolName !== 'string') continue
      const toolName = r.toolName.trim()
      if (toolName === '' || toolName.length > MAX_TOOL_NAME || /[()\s]/.test(toolName)) continue
      const content = typeof r.ruleContent === 'string' ? r.ruleContent : undefined
      if (content !== undefined && content.length > MAX_RULE_CONTENT) continue
      rules.add(ruleString(toolName, content))
      if (rules.size >= MAX_RULES) return [...rules]
    }
  }
  return [...rules]
}

/** The card may offer "Always in this workspace": an `allow` rule exists and the CLI does not forbid "always allow". */
export function canAllowInWorkspace(
  suggestions: readonly PermissionUpdate[] | undefined,
  suppressAlwaysAllowRule: boolean | undefined
): boolean {
  return !suppressAlwaysAllowRule && allowRulesOf(suggestions).length > 0
}

/** Suggestions with every `destination` replaced by `session` (the CLI writes nothing to a file on its own). */
export function retargetToSession(suggestions: readonly PermissionUpdate[]): PermissionUpdate[] {
  return suggestions.map((s) => ({ ...s, destination: 'session' }))
}

export interface MergedSettings {
  /** Text to write (JSON with 2 spaces and a final line break). */
  text: string
  /** `false` = all rules were already there (nothing to write). */
  changed: boolean
}

/**
 * Appends `rules` to `permissions.allow` of the current `settings.local.json` content (`null` = new file), without
 * duplicating and preserving the other keys. Throws if the file is not an object JSON: we never overwrite a file we do
 * not understand.
 */
export function mergeAllowRules(existing: string | null, rules: readonly string[]): MergedSettings {
  const invalid = (message: string): never => {
    throw new UserError(message)
  }
  const texts = t().claudeHost.permissions
  let root: Record<string, unknown> = {}
  if (existing !== null && existing.trim() !== '') {
    let parsed: unknown
    try {
      parsed = JSON.parse(existing.replace(/^\uFEFF/, ''))
    } catch {
      return invalid(texts.localNotJson)
    }
    if (!isRecord(parsed)) return invalid(texts.localNotObject)
    root = parsed
  }
  const permissions = root.permissions
  if (permissions !== undefined && !isRecord(permissions)) return invalid(texts.localPermissionsNotObject)
  const allow = permissions?.allow
  if (allow !== undefined && !Array.isArray(allow)) return invalid(texts.localAllowNotList)

  const current: unknown[] = allow ?? []
  const present = new Set(current.filter((r): r is string => typeof r === 'string'))
  const added = [...new Set(rules)].filter((r) => !present.has(r))
  if (added.length === 0 && existing !== null) return { text: existing, changed: false }
  const next = {
    ...root,
    permissions: { ...(permissions ?? {}), allow: [...current, ...added] }
  }
  return { text: `${JSON.stringify(next, null, 2)}\n`, changed: true }
}

/** Queued `settings.local.json` writes: two consecutive "Always in this workspace" answers do not lose a rule. */
const localSettingsWrites = new SerialQueue()

/**
 * Writes the rules to `<folder>/.claude/settings.local.json` (path computed here, never coming from the renderer).
 * Throws if it cannot; `getRoot` is only read when the write's turn comes.
 */
export function saveWorkspaceRules(getRoot: () => string | null, rules: string[]): Promise<void> {
  return localSettingsWrites.run(async () => {
    const root = getRoot()
    if (!root) throw new UserError(t().claudeHost.permissions.noFolder)
    // Even with the file missing: validates that `.claude/` (or the file itself) is not a symlink out of the folder.
    const path = await resolveInsideRoot(root, join(root, '.claude', 'settings.local.json'))
    const existing = await readTextOrNull(path, MAX_LOCAL_SETTINGS_BYTES)
    const merged = mergeAllowRules(existing, rules)
    if (merged.changed) await writeTextAtomic(root, path, merged.text)
    // File created just now: the CLI did not keep it out of git (it only does so when creating it), so Walph adds it to
    // the private exclude.
    if (existing === null) await ensureLocalSettingsIgnored(root)
  })
}
