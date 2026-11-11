import { describe, expect, it } from 'vitest'
import { DockerError, classifyDockerFailure } from './errors'
import { parseInfo } from './parseInfo'

describe('parseInfo', () => {
  it('daemon ok', () => {
    expect(parseInfo('{"ServerVersion":"27.4.0","MemTotal":100,"NCPU":4}', '', 'desktop-linux')).toEqual({
      ok: true,
      context: 'desktop-linux',
      version: '27.4.0',
      memTotal: 100,
      cpus: 4
    })
  })
  it('daemon down: code 0, empty version and ServerErrors', () => {
    const out = parseInfo(
      '{"ServerVersion":"","ServerErrors":["Cannot connect to the Docker daemon at unix:///x. Is the docker daemon running?"]}',
      'failed to connect',
      null
    )
    expect(out).toEqual({
      ok: false,
      reason: 'daemonDown',
      message: 'Não foi possível conectar ao Docker. Abra o Docker Desktop (ou inicie o daemon) e tente de novo.'
    })
  })
  it('empty version with stderr only', () => {
    expect(parseInfo('{"ServerVersion":""}', 'Cannot connect to the Docker daemon', null)).toMatchObject({
      reason: 'daemonDown'
    })
    expect(parseInfo('{"ServerVersion":""}', '', null)).toMatchObject({ reason: 'daemonDown' })
  })
  it('output that is not JSON', () => {
    expect(parseInfo('junk', '', null)).toMatchObject({ ok: false, reason: 'error' })
  })
})

describe('DockerError', () => {
  it('carries reason and message without a duplicated prefix', () => {
    const err = new DockerError(classifyDockerFailure({ code: 'ENOENT' }))
    expect(err.info.reason).toBe('notInstalled')
    expect(err.message).toBe(
      'Docker não encontrado. Instale o Docker Desktop ou configure "docker.path" com o caminho do executável.'
    )
    const other = new DockerError(classifyDockerFailure({ stderr: 'boom' }))
    expect(other.message).toBe('Docker: boom')
  })
})
