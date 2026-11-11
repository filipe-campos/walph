// Slash commands in files: `<folder>/.claude/commands/**/*.md` (project) and `~/.claude/commands/**/*.md` (user).
// The command name comes from the path (`folder/sub/name.md` → `folder:sub:name`) and the description/hint from the
// frontmatter. Everything that comes from disk is UNTRUSTED text (the project may be a cloned repository): no control
// characters, limited sizes, never rendered as markdown. Only reads inside `.claude/commands` (a symlink leaving it is
// ignored).

import { flattenControl } from '@shared/controlChars'
import { lstat, open, readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ClaudeSlashCommand } from '@shared/types'
import { isInside } from '@shared/pathCompare'

export interface CommandFile {
  name: string
  description: string
  argumentHint: string
  scope: 'project' | 'user'
}

const MAX_NAME = 100
const MAX_DESCRIPTION = 300
const MAX_HINT = 100
/** Only the start of the file matters (frontmatter + first body line). */
const MAX_READ_BYTES = 16 * 1024
const MAX_DEPTH = 6
const MAX_FILES = 500

/** No control characters (line breaks included) nor repeated spaces; cuts at `max`. */
export function sanitizeText(value: string, max: number): string {
  const clean = flattenControl(value).replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function unquote(value: string): string {
  const v = value.trim()
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) return v.slice(1, -1)
  return v
}

/**
 * Minimal YAML frontmatter (`key: value`, quoted value, `|`/`>` blocks). Without frontmatter: everything is body. Keys
 * in lowercase. Does not interpret lists or objects (the values that matter here are text).
 */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const source = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n')
  if (!source.startsWith('---\n')) return { data: {}, body: source }
  const end = source.indexOf('\n---', 3)
  if (end === -1) return { data: {}, body: source }
  const afterFence = source.indexOf('\n', end + 1)
  const body = afterFence === -1 ? '' : source.slice(afterFence + 1)
  const lines = source.slice(4, end).split('\n')
  const data: Record<string, string> = {}
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(lines[i] ?? '')
    if (!m) continue
    const key = (m[1] ?? '').toLowerCase()
    const raw = (m[2] ?? '').trim()
    if (raw === '' || /^[|>][+-]?$/.test(raw)) {
      const parts: string[] = []
      for (let next = lines[i + 1]; next !== undefined && (/^\s+\S/.test(next) || next === ''); next = lines[i + 1]) {
        parts.push(next.trim())
        i++
      }
      data[key] = parts.join(' ').trim()
    } else data[key] = unquote(raw)
  }
  return { data, body }
}

/** `a/b/c.md` (or `a\b\c.md`) → `a:b:c`; `null` if the name cannot be typed (empty, spaces). */
export function commandNameFor(relPath: string): string | null {
  const parts = relPath.split(/[\\/]/).filter(Boolean)
  if (parts.length === 0) return null
  const last = parts[parts.length - 1]
  if (last === undefined || !/\.md$/i.test(last)) return null
  parts[parts.length - 1] = last.replace(/\.md$/i, '')
  const name = sanitizeText(parts.join(':'), MAX_NAME)
  return name === '' || /\s/.test(name) || name !== parts.join(':') ? null : name
}

/** First non-empty body line, without the heading `#` (as the CLI does when there is no `description`). */
function firstBodyLine(body: string): string {
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (t !== '') return t.replace(/^#+\s*/, '')
  }
  return ''
}

/** A `.md` file → command, or `null` if the name is invalid. */
export function parseCommandFile(relPath: string, text: string, scope: CommandFile['scope']): CommandFile | null {
  const name = commandNameFor(relPath)
  if (!name) return null
  const { data, body } = parseFrontmatter(text)
  return {
    name,

    description: sanitizeText(data.description || firstBodyLine(body), MAX_DESCRIPTION),
    argumentHint: sanitizeText(data['argument-hint'] ?? '', MAX_HINT),
    scope
  }
}

/**
 * Merges the CLI `init` commands with the files: a name in a file gets its scope (`project` beats `user`) and the
 * file's sanitized text when it exists; the rest of `init` is `builtin`; a file outside `init` also appears.
 * `files` must already come without scope duplicates in precedence order (`project` before `user`).
 */
export function mergeCommands(
  init: ReadonlyArray<{ name?: unknown; description?: unknown; argumentHint?: unknown }>,
  files: readonly CommandFile[]
): ClaudeSlashCommand[] {
  const byName = new Map<string, CommandFile>()
  for (const f of files) if (!byName.has(f.name)) byName.set(f.name, f)
  const out: ClaudeSlashCommand[] = []
  const seen = new Set<string>()
  for (const c of init) {
    const name = sanitizeText(String(c.name ?? ''), MAX_NAME)
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    const file = byName.get(name)
    out.push({
      name,

      description: sanitizeText(file?.description || String(c.description ?? ''), MAX_DESCRIPTION),

      argumentHint: sanitizeText(file?.argumentHint || String(c.argumentHint ?? ''), MAX_HINT),
      scope: file?.scope ?? 'builtin'
    })
  }
  const rest = [...byName.values()].filter((f) => !seen.has(f.name)).sort((a, b) => a.name.localeCompare(b.name))
  for (const f of rest) out.push({ ...f })
  return out
}

async function readHead(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(MAX_READ_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, MAX_READ_BYTES, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

interface CacheEntry {
  mtimeMs: number
  size: number
  command: CommandFile | null
}

/** Reads both command directories; unchanged files (mtime + size) are not reread. No watcher. */
export class CommandFileReader {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(private readonly home: () => string = homedir) {}

  /** Project first (beats the user on the same name). Never throws: missing or unreadable folder = no commands. */
  async read(root: string | null): Promise<CommandFile[]> {
    const project = root ? await this.readDir(join(root, '.claude', 'commands'), 'project', root) : []
    const user = await this.readDir(join(this.home(), '.claude', 'commands'), 'user', null)
    const taken = new Set<string>()
    const out: CommandFile[] = []
    for (const c of [...project, ...user]) {
      if (taken.has(c.name)) continue
      taken.add(c.name)
      out.push(c)
    }
    return out
  }

  private async readDir(dir: string, scope: CommandFile['scope'], projectRoot: string | null): Promise<CommandFile[]> {
    let realDir: string
    try {
      realDir = await realpath(dir)
      // The project directory belongs to the repository: a `.claude/commands` symlink pointing outside does not count.
      if (projectRoot && !isInside(await realpath(projectRoot), realDir)) return []
    } catch {
      return []
    }
    const found: CommandFile[] = []
    const visited = new Set<string>()
    let budget = MAX_FILES
    const walk = async (current: string, depth: number, names: string[]): Promise<void> => {
      if (depth > MAX_DEPTH || visited.has(current)) return
      visited.add(current)
      let entries
      try {
        entries = await readdir(current, { withFileTypes: true })
      } catch {
        return
      }
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        if (budget <= 0) return
        const path = join(current, entry.name)
        let real = path
        try {
          if ((await lstat(path)).isSymbolicLink()) {
            real = await realpath(path)
            // A link that leaves `.claude/commands` is not followed.
            if (!isInside(realDir, real)) continue
          }
          const info = await stat(real)
          if (info.isDirectory()) {
            await walk(real, depth + 1, [...names, entry.name])
          } else if (info.isFile() && /\.md$/i.test(entry.name)) {
            budget--
            const command = await this.load(
              path,
              real,
              info.mtimeMs,
              info.size,
              [...names, entry.name].join('/'),
              scope
            )
            if (command) found.push(command)
          }
        } catch {
          // entry unreadable or gone midway: ignored
        }
      }
    }
    await walk(realDir, 0, [])
    return found
  }

  private async load(
    path: string,
    real: string,
    mtimeMs: number,
    size: number,
    rel: string,
    scope: CommandFile['scope']
  ): Promise<CommandFile | null> {
    const key = `${scope}\0${path}`
    const hit = this.cache.get(key)
    if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return hit.command
    let command: CommandFile | null
    try {
      command = parseCommandFile(rel, await readHead(real), scope)
    } catch {
      command = null
    }
    this.cache.set(key, { mtimeMs, size, command })
    return command
  }
}
