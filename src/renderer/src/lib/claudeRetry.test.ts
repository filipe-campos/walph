import { describe, expect, it } from 'vitest'
import { retryCause, retryLabel, retryRemaining } from './claudeRetry'

const retry = { attempt: 2, maxRetries: 10, delayMs: 8000, errorStatus: 529, timestamp: 1000 }

describe('retryCause', () => {
  it('by HTTP status', () => {
    expect(retryCause(529)).toBe('Servidor sobrecarregado')
    expect(retryCause(429)).toBe('Muitas requisições')
    expect(retryCause(null)).toBe('Falha de conexão')
    expect(retryCause(503)).toBe('Erro no servidor (503)')
    expect(retryCause(408)).toBe('Erro da API (408)')
  })
})

describe('retryLabel', () => {
  it('shows the countdown', () => {
    expect(retryLabel(retry, 1000)).toBe('Servidor sobrecarregado — tentando de novo (2/10) em 8 s')
    expect(retryLabel(retry, 1000 + 2500)).toBe('Servidor sobrecarregado — tentando de novo (2/10) em 6 s')
  })

  it('zero becomes "agora" and never goes negative', () => {
    expect(retryRemaining(retry, 99_000)).toBe(0)
    expect(retryLabel({ ...retry, errorStatus: null }, 99_000)).toBe('Falha de conexão — tentando de novo (2/10) agora')
  })
})
