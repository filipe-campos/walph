// Which renderer responses fit each kind of permission request. Pure: the `PermissionBroker` only hands Claude a
// response that went through here.

import { validateElicitationContent } from '@shared/elicitation'
import type { ClaudePermissionRequest, ClaudePermissionResponse } from '@shared/types'
import { buildAnswerInput } from './question'

/**
 * A question only accepts a valid `answer` or `skip`; elicitation (MCP) only accepts `elicitation`, and the form
 * `content` is revalidated against the fields; the other requests (tool, plan, edit) only `allow`/`deny`.
 */
export function isResponseValidFor(request: ClaudePermissionRequest, response: ClaudePermissionResponse): boolean {
  if (request.kind === 'question') {
    return (
      response.behavior === 'skip' ||
      (response.behavior === 'answer' && buildAnswerInput({}, request.questions, response.answers).ok)
    )
  }
  if (request.kind === 'elicitation') {
    return (
      response.behavior === 'elicitation' &&
      (response.action !== 'accept' ||
        request.mode === 'url' ||
        validateElicitationContent(request.fields, response.content).ok)
    )
  }
  return response.behavior !== 'answer' && response.behavior !== 'skip' && response.behavior !== 'elicitation'
}
