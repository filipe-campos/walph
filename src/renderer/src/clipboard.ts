import { t } from '@shared/i18n'
import { attempt } from './attempt'

/** Copies text to the clipboard. `true` if it copied; on failure it notifies and returns `false`. */
export async function copyText(text: string): Promise<boolean> {
  return attempt(
    async () => {
      await navigator.clipboard.writeText(text)
      return true
    },
    { format: () => t().common.copyFailed, fallback: false }
  )
}
