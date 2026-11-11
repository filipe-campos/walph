import { useMemo } from 'react'
import { errorMessage } from '../../lib/errors'
import { checkCloneUrl } from '../../cloneActions'
import { useAsync } from '../common/useAsync'

export type CloneUrlChecked = { ok: true; name: string } | { ok: false; error: string }

/** Pause after the last keystroke before validating (each validation is a round trip to main). */
const CLONE_CHECK_DEBOUNCE_MS = 150

/**
 * Validates the typed clone URL in main. `null` while the response for THIS URL has not arrived: the result stores the
 * URL
 * it belongs to, so a late response for a previous text is never shown.
 */
export function useCloneUrlCheck(enabled: boolean, text: string): CloneUrlChecked | null {
  const url = text.trim()
  const { status, value, error } = useAsync(() => checkCloneUrl(url), [url], {
    enabled: enabled && !!url,
    delayMs: CLONE_CHECK_DEBOUNCE_MS
  })
  return useMemo(() => {
    if (status === 'success') return value!
    if (status === 'error') return { ok: false, error: errorMessage(error) }
    return null
  }, [status, value, error])
}
