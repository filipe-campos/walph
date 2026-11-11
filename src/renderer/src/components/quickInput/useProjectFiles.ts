import { useMemo } from 'react'
import type { FileList } from '@shared/types'
import { loadFileList } from '../../projectFiles'
import { errorMessage } from '../../lib/errors'
import { useAsync } from '../common/useAsync'

type Loaded = { root: string; list: FileList } | { root: string; error: string }

/**
 * List of the folder files for Quick Open. Only fetches when `enabled` (files mode); the
 * `projectFiles.ts` cache (TTL, invalidated by the watcher) and main's make reopening cheap. Returns null while loading
 * (or without a folder).
 */
export function useProjectFiles(enabled: boolean, root: string | null): Loaded | null {
  const { status, value, error } = useAsync(() => loadFileList(root!), [root], { enabled: enabled && !!root })
  return useMemo(() => {
    if (!root) return null
    if (status === 'success') return { root, list: value! }
    if (status === 'error') return { root, error: errorMessage(error) }
    return null
  }, [root, status, value, error])
}
