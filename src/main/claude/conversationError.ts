import { t } from '@shared/i18n'
import { UserError } from '../errors'

export type ConversationErrorCode = 'closed' | 'usageTimeout' | 'invalidReport'

/** Expected conversation error; the code avoids classifying by the translated text. */
export class ConversationError extends UserError {
  constructor(readonly code: ConversationErrorCode) {
    super(
      code === 'closed'
        ? t().claudeHost.conversation.closed
        : code === 'usageTimeout'
          ? t().claudeHost.conversation.usageTimeout
          : t().claudeHost.usage.invalidReport
    )
  }
}
