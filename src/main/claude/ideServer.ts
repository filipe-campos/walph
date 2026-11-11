// In-process `walph` MCP server: the IDE tools Claude can call (LSP diagnostics, current file and selection, open
// tabs, workspace folder and open diff). Read-only, except `openDiff`, which goes through the user's approval (the
// panel `edit` card) before writing.

import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import { createRequire } from 'node:module'
import type * as ZodModule from 'zod'
import type { ClaudeEditorContext } from '@shared/types'
import type { Sdk } from './sdk'
import { formatDiagnostics, formatOpenEditors, formatSelection, type FileDiagnostics } from './ideFormat'

// zod is only needed when a Claude conversation starts: loading it at the top cost time in the main boot. The main
// bundle is CJS and `zod` is externalized, so the lazy `require` resolves from node_modules as the import would.
const loadZod = (): typeof ZodModule => createRequire(__filename)('zod') as typeof ZodModule

export const IDE_SERVER_NAME = 'walph'

/** Read-only tools, allowed without asking (`allowedTools`). `openDiff` asks for approval in its own flow. */
export const IDE_TOOL_NAMES = [
  'getDiagnostics',
  'getCurrentSelection',
  'getOpenEditors',
  'getWorkspaceFolders',
  'openDiff'
]
export const IDE_ALLOWED_TOOLS = IDE_TOOL_NAMES.map((name) => `mcp__${IDE_SERVER_NAME}__${name}`)

export interface IdeHost {
  getRoot(): string | null
  getEditorContext(): ClaudeEditorContext
  getDiagnostics(path?: string): Promise<FileDiagnostics[]>
  /** Shows the diff and, if the user accepts, writes. `accepted: false` carries the reason given by the user. */
  openDiff(filePath: string, newContents: string): Promise<{ accepted: boolean; message?: string; changed?: boolean }>
}

const text = (value: string, isError = false) => ({ content: [{ type: 'text' as const, text: value }], isError })

export function createIdeServer(sdk: Sdk, host: IdeHost): McpSdkServerConfigWithInstance {
  const { z } = loadZod()
  // Any failure becomes an error result for Claude (never brings the conversation down).
  const guarded =
    <A>(fn: (args: A) => Promise<string> | string) =>
    async (args: A) => {
      try {
        return text(await fn(args))
      } catch (err) {
        return text(err instanceof Error ? err.message : 'IDE tool failure.', true)
      }
    }

  return sdk.createSdkMcpServer({
    name: IDE_SERVER_NAME,
    version: '1.0.0',
    tools: [
      sdk.tool(
        'getDiagnostics',
        'Get language-server diagnostics (errors, warnings) from the IDE for the files open in the editor. Pass filePath to limit to one file. Prefer this over running a build to see type errors.',
        { filePath: z.string().optional().describe('Absolute path of a single file; omit for all open files') },
        guarded(async ({ filePath }: { filePath?: string | undefined }) => {
          const root = host.getRoot()
          if (!root) throw new Error('No folder is open in the IDE.')
          return formatDiagnostics(await host.getDiagnostics(filePath), root)
        })
      ),
      sdk.tool(
        'getCurrentSelection',
        'Get the text currently selected in the IDE editor (file path, 1-based line range and text), or the active file when nothing is selected.',
        {},
        guarded(() => formatSelection(host.getEditorContext()))
      ),
      sdk.tool(
        'getOpenEditors',
        'List the files open in IDE editor tabs, the active one, and which have unsaved changes.',
        {},
        guarded(() => formatOpenEditors(host.getEditorContext()))
      ),
      sdk.tool(
        'getWorkspaceFolders',
        'Get the workspace folder opened in the IDE.',
        {},
        guarded(() => JSON.stringify({ folders: host.getRoot() ? [host.getRoot()] : [] }))
      ),
      sdk.tool(
        'openDiff',
        'Show a side-by-side diff in the IDE between a file and the proposed full new contents, and wait for the user to accept or reject. On accept the IDE writes the file. Use for proposing changes the user should review.',
        {
          filePath: z.string().describe('Absolute path of the file inside the workspace'),
          newContents: z.string().describe('The complete proposed contents of the file')
        },
        guarded(async ({ filePath, newContents }: { filePath: string; newContents: string }) => {
          const result = await host.openDiff(filePath, newContents)
          if (result.changed) {
            return 'The file changed on disk while the diff was open, so nothing was written. Read the file again and propose the change again.'
          }
          return result.accepted
            ? 'The user accepted the changes and the file was written.'
            : `The user rejected the changes.${result.message ? ` Reason: ${result.message}` : ''}`
        })
      )
    ]
  })
}
