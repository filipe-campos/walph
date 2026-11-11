import { describe, expect, it } from 'vitest'
import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk'
import { allowRulesOf, canAllowInWorkspace, mergeAllowRules, retargetToSession, ruleString } from './localPermissions'

const add = (rules: Array<{ toolName: string; ruleContent?: string }>, behavior = 'allow'): PermissionUpdate =>
  ({ type: 'addRules', rules, behavior, destination: 'localSettings' }) as PermissionUpdate

describe('ruleString', () => {
  it('Tool or Tool(content) with escaping', () => {
    expect(ruleString('Bash')).toBe('Bash')
    expect(ruleString('Bash', '')).toBe('Bash')
    expect(ruleString('Bash', 'npm test:*')).toBe('Bash(npm test:*)')
    expect(ruleString('Bash', 'echo (x) \\n')).toBe('Bash(echo \\(x\\) \\\\n)')
  })
})

describe('allowRulesOf / canAllowInWorkspace', () => {
  it('only addRules allow, without duplicates', () => {
    const s = [
      add([
        { toolName: 'Bash', ruleContent: 'npm test' },
        { toolName: 'Bash', ruleContent: 'npm test' }
      ]),
      add([{ toolName: 'Read' }], 'deny'),
      { type: 'setMode', mode: 'acceptEdits', destination: 'session' } as PermissionUpdate,
      add([{ toolName: 'Edit' }])
    ]
    expect(allowRulesOf(s)).toEqual(['Bash(npm test)', 'Edit'])
    expect(canAllowInWorkspace(s, false)).toBe(true)
  })
  it('without an allow rule, or with suppressAlwaysAllowRule, it cannot', () => {
    expect(canAllowInWorkspace(undefined, false)).toBe(false)
    expect(canAllowInWorkspace([add([{ toolName: 'X' }], 'deny')], false)).toBe(false)
    expect(canAllowInWorkspace([add([{ toolName: 'X' }])], true)).toBe(false)
  })
  it('drops malformed tool names', () => {
    expect(allowRulesOf([add([{ toolName: 'a b' }, { toolName: '' }, { toolName: 'Foo(' }])])).toEqual([])
  })
})

describe('retargetToSession', () => {
  it('replaces the destination of all', () => {
    const out = retargetToSession([
      add([{ toolName: 'Bash' }]),
      { type: 'setMode', mode: 'plan', destination: 'userSettings' }
    ])
    expect(out.map((s) => s.destination)).toEqual(['session', 'session'])
  })
})

describe('mergeAllowRules', () => {
  it('creates the content when the file does not exist', () => {
    const r = mergeAllowRules(null, ['Bash(npm test)'])
    expect(r.changed).toBe(true)
    expect(JSON.parse(r.text)).toEqual({ permissions: { allow: ['Bash(npm test)'] } })
    expect(r.text.endsWith('\n')).toBe(true)
  })
  it('preserves other keys and rules and does not duplicate', () => {
    const existing = JSON.stringify({
      env: { A: '1' },
      permissions: { allow: ['Read', 'Bash(ls)'], deny: ['Bash(rm:*)'], defaultMode: 'plan' }
    })
    const r = mergeAllowRules(existing, ['Bash(ls)', 'Edit'])
    expect(JSON.parse(r.text)).toEqual({
      env: { A: '1' },
      permissions: { allow: ['Read', 'Bash(ls)', 'Edit'], deny: ['Bash(rm:*)'], defaultMode: 'plan' }
    })
  })
  it('with nothing new returns the original text and changed=false', () => {
    const existing = '{ "permissions": { "allow": ["Edit"] } }'
    expect(mergeAllowRules(existing, ['Edit'])).toEqual({ text: existing, changed: false })
  })
  it('an empty file counts as new; BOM is tolerated', () => {
    expect(JSON.parse(mergeAllowRules('  \n', ['A']).text)).toEqual({ permissions: { allow: ['A'] } })
    expect(JSON.parse(mergeAllowRules('\uFEFF{}', ['A']).text)).toEqual({ permissions: { allow: ['A'] } })
  })
  it('throws in pt-BR for invalid JSON or an unexpected shape, without overwriting', () => {
    expect(() => mergeAllowRules('{ broken', ['A'])).toThrow('não é um JSON válido')
    expect(() => mergeAllowRules('[]', ['A'])).toThrow('objeto JSON')
    expect(() => mergeAllowRules('{"permissions": 3}', ['A'])).toThrow('"permissions"')
    expect(() => mergeAllowRules('{"permissions": {"allow": "x"}}', ['A'])).toThrow('"permissions.allow"')
  })
})
