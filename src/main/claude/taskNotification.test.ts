import { describe, expect, it } from 'vitest'
import { isTaskNotification, parseTaskNotification } from './taskNotification'

const SAMPLE =
  '<task-notification><task-id>x</task-id><status>completed</status><summary>Agent "Re-review" finished</summary><result>' +
  'long '.repeat(500) +
  '</result></task-notification>'

describe('parseTaskNotification', () => {
  it('extracts status and summary and drops the long result', () => {
    expect(parseTaskNotification(SAMPLE)).toEqual({ status: 'completed', summary: 'Agent "Re-review" finished' })
  })

  it('decodes entities and caps the length', () => {
    const out = parseTaskNotification(
      `<task-notification><status>failed</status><summary>a &amp; b ${'z'.repeat(400)}</summary></task-notification>`
    )
    expect(out?.summary.startsWith('a & b z')).toBe(true)
    expect(out?.summary.length).toBe(300)
  })

  it('plain text is not a notification', () => {
    expect(parseTaskNotification('hello')).toBeNull()
    expect(isTaskNotification('  <task-notification>')).toBe(true)
  })
})
