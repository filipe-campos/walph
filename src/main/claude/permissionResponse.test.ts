import { describe, expect, it } from 'vitest'
import type { ClaudePermissionRequest, ClaudePermissionResponse } from '@shared/types'
import { isResponseValidFor } from './permissionResponse'

const tool: ClaudePermissionRequest = {
  kind: 'tool',
  requestId: 'r',
  toolName: 'Bash',
  title: 't',
  input: {},
  canAlwaysAllow: true,
  canAllowInWorkspace: false
}
const edit: ClaudePermissionRequest = {
  kind: 'edit',
  requestId: 'r',
  toolName: 'Edit',
  path: '/a',
  original: '',
  proposed: 'x',
  isNewFile: true
}
const plan: ClaudePermissionRequest = { kind: 'plan', requestId: 'r', plan: 'p' }
const question: ClaudePermissionRequest = {
  kind: 'question',
  requestId: 'r',
  questions: [
    {
      id: 'q1',
      header: 'H',
      question: 'Which?',
      multiSelect: false,
      options: [
        { label: 'A', description: '' },
        { label: 'B', description: '' }
      ]
    }
  ]
}
const form: ClaudePermissionRequest = {
  kind: 'elicitation',
  requestId: 'r',
  serverName: 's',
  message: 'm',
  mode: 'form',
  fields: [{ key: 'name', label: 'Name', description: '', required: true, type: 'string' }]
}
const url: ClaudePermissionRequest = { ...form, mode: 'url', url: 'https://example.com', fields: [] }

const allow: ClaudePermissionResponse = { behavior: 'allow' }
const deny: ClaudePermissionResponse = { behavior: 'deny' }
const skip: ClaudePermissionResponse = { behavior: 'skip' }
const answer = (answers: Record<string, string[]>): ClaudePermissionResponse => ({ behavior: 'answer', answers })
const elicit = (
  action: 'accept' | 'decline' | 'cancel',
  content?: Record<string, string>
): ClaudePermissionResponse => ({
  behavior: 'elicitation',
  action,
  ...(content ? { content } : {})
})

describe('isResponseValidFor', () => {
  const cases: Array<[string, ClaudePermissionRequest, ClaudePermissionResponse, boolean]> = [
    ['tool accepts allow', tool, allow, true],
    ['tool accepts deny', tool, deny, true],
    ['tool rejects skip', tool, skip, false],
    ['tool rejects answer', tool, answer({}), false],
    ['tool rejects elicitation', tool, elicit('accept'), false],
    ['edit accepts allow and deny', edit, allow, true],
    ['edit rejects skip', edit, skip, false],
    ['plan accepts allow', plan, allow, true],
    ['plan rejects elicitation', plan, elicit('cancel'), false],
    ['question accepts skip', question, skip, true],
    ['question accepts a valid answer', question, answer({ q1: ['A'] }), true],
    ['question accepts free text (Other)', question, answer({ q1: ['Z'] }), true],
    ['question rejects an empty answer', question, answer({ q1: [] }), false],
    ['question rejects an unknown question', question, answer({ q9: ['A'] }), false],
    ['question rejects allow', question, allow, false],
    ['question rejects deny', question, deny, false],
    ['question rejects elicitation', question, elicit('decline'), false],
    ['form accepts decline and cancel without validating', form, elicit('decline'), true],
    ['form accepts cancel', form, elicit('cancel'), true],
    ['form accepts accept with valid content', form, elicit('accept', { name: 'x' }), true],
    ['form rejects accept without a required field', form, elicit('accept'), false],
    ['form rejects allow', form, allow, false],
    ['form rejects skip', form, skip, false],
    ['url accepts accept without content', url, elicit('accept'), true],
    ['url rejects deny', url, deny, false]
  ]

  it.each(cases)('%s', (_name, request, response, expected) => {
    expect(isResponseValidFor(request, response)).toBe(expected)
  })
})
