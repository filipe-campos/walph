import { t } from '@shared/i18n'
import { clampText } from './buildPrompt'

/** Tool output sent to the renderer (~20 KB). */
export const MAX_TOOL_RESULT_CHARS = 20_000

export function truncateToolOutput(text: string, max: number = MAX_TOOL_RESULT_CHARS): string {
  const { text: cut, truncated } = clampText(text, max)
  return truncated ? `${cut}\n${t().claudeHost.conversation.truncatedOutput(text.length - cut.length)}` : cut
}
