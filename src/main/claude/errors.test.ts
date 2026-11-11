import { afterEach, describe, expect, it } from 'vitest'
import { setLocale } from '@shared/i18n'
import { classifyAssistantError, classifyFailure, classifyResultText, stderrSummary } from './errors'

describe('classifyAssistantError', () => {
  it('authentication becomes auth', () => {
    expect(classifyAssistantError('authentication_failed')).toEqual({
      code: 'auth',
      message: 'Você não está autenticado no Claude Code. Rode `claude` no terminal e faça login.'
    })
  })
  it('limits and unknown codes become other in pt-BR', () => {
    expect(classifyAssistantError('rate_limit').code).toBe('other')
    expect(classifyAssistantError('something_new').message).toContain('Claude')
  })

  afterEach(() => setLocale('pt-BR'))

  it('follows the current language', () => {
    setLocale('en')
    expect(classifyAssistantError('overloaded').message).toBe('Claude is overloaded right now. Try again.')
  })
})

describe('classifyResultText', () => {
  it('recognizes login text', () => {
    expect(classifyResultText('Invalid API key · Please run /login')?.code).toBe('auth')
    expect(classifyResultText('Not logged in')?.code).toBe('auth')
    expect(classifyResultText('all good')).toBeNull()
  })
})

describe('classifyFailure', () => {
  it('missing executable', () => {
    const err = Object.assign(new Error('spawn /x/claude ENOENT'), { code: 'ENOENT' })
    expect(classifyFailure(err).code).toBe('executable')
    expect(classifyFailure(new Error('Native CLI binary for darwin-arm64 not found')).code).toBe('executable')
  })
  it('an exited process includes the stderr tail', () => {
    const r = classifyFailure(
      new Error('Claude Code process exited with code 1'),
      'line1\n\u001b[31mserious error\u001b[0m\n'
    )
    expect(r.code).toBe('process')
    expect(r.message).toContain('serious error')
    expect(r.message).not.toContain('\u001b')
  })
  it('login in stderr wins', () => {
    expect(classifyFailure(new Error('exited with code 1'), 'Error: Not logged in').code).toBe('auth')
  })
  it('others', () => {
    expect(classifyFailure('boom').code).toBe('other')
  })
})

describe('stderrSummary', () => {
  it('caps lines and length', () => {
    const s = stderrSummary(Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n'))
    expect(s.split('\n')).toEqual(['l6', 'l7', 'l8', 'l9'])
    expect(stderrSummary('x'.repeat(1000)).length).toBe(400)
  })
})
