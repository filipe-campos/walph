import { listSnippets, openSnippetFile, rebindSnippets } from '../snippets/service'
import { getWindowRoot, onWindowRootChange } from '../window/windows'
import { handle } from './typed'

export function registerSnippetsHandlers(): void {
  onWindowRootChange((wc, root) => rebindSnippets(wc, root))
  handle('snippets:list', (e) => listSnippets(e.sender, getWindowRoot(e.sender)))
  handle('snippets:openFile', (e, kind: unknown, name: unknown) => openSnippetFile(e.sender, kind, name))
}
