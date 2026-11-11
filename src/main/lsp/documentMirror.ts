import { t } from '@shared/i18n'
import type { LspTextChange } from '@shared/types'
import { pathKey } from '@shared/pathCompare'
import { applyChanges } from './applyChanges'
import type { SemanticTokensCache } from './semanticTokens'
import type { ServerDocument } from './server'
import { canonicalPath, pathToUri } from './uri'
import type { EditContext } from './workspaceEdit'
import { UserError } from '../errors'

export interface ManagedDoc extends ServerDocument {
  path: string
  key: string
  /** `null` = no server handles the file now (the mirror stays: turning a server on later reaches it). */
  serverId: string | null
  /** The server's last raw diagnostics (they go into the `codeAction` `context`). */
  diagnostics: unknown[]
  semanticTokens?: SemanticTokensCache | undefined
}

interface OpenInit {
  path: string
  text: string
  version: number
  languageId: string
  serverId: string | null
}

/** Mirror of the window's open documents, with the text and the version the renderer reported. */
export class DocumentMirror {
  private readonly docs = new Map<string, ManagedDoc>()

  get(path: string): ManagedDoc | undefined {
    return this.docs.get(pathKey(path))
  }

  has(path: string): boolean {
    return this.docs.has(pathKey(path))
  }

  values(): IterableIterator<ManagedDoc> {
    return this.docs.values()
  }

  forServer(serverId: string): ManagedDoc[] {
    return [...this.docs.values()].filter((d) => d.serverId === serverId)
  }

  /** Replaces the document with the same path; returns the previous one for whoever needs to close it on the server. */
  open(init: OpenInit): { doc: ManagedDoc; previous: ManagedDoc | undefined } {
    const key = pathKey(init.path)
    const previous = this.docs.get(key)
    const doc: ManagedDoc = {
      path: init.path,
      key,
      uri: pathToUri(init.path),
      languageId: init.languageId,
      text: init.text,
      version: init.version,
      serverId: init.serverId,
      diagnostics: []
    }
    this.docs.set(key, doc)
    return { doc, previous }
  }

  change(path: string, version: number, changes: readonly LspTextChange[]): ManagedDoc | undefined {
    const doc = this.get(path)
    if (!doc) return undefined
    doc.text = applyChanges(doc.text, changes)
    doc.version = version
    return doc
  }

  close(path: string): ManagedDoc | undefined {
    const doc = this.get(path)
    if (doc) this.docs.delete(doc.key)
    return doc
  }

  clear(): void {
    this.docs.clear()
  }

  /** Context to judge server edits; throws without a folder (`isInside('', x)` would be true for everything). */
  editContext(root: string | null): EditContext {
    if (!root) throw new UserError(t().lsp.errors.noFolder)
    return {
      root,
      versionOf: (path) => this.get(path)?.version,
      openPath: (path) => this.get(path)?.path
    }
  }

  /** Spelling of the paths returned by the server = the one the renderer uses (`canonicalPath`). */
  canon(root: string | null): (path: string) => string {
    return (path) => canonicalPath(path, root, (p) => this.get(p)?.path)
  }
}
