import { describe, expect, it } from 'vitest'
import { classifyDockerFailure } from './errors'

describe('classifyDockerFailure', () => {
  it('not installed', () => {
    expect(classifyDockerFailure({ code: 'ENOENT' })).toMatchObject({ reason: 'notInstalled' })
  })
  it.each([
    'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
    'error during connect: Get "http://x/v1.47/info": open //./pipe/docker_engine: The system cannot find the file specified.'
  ])('daemon down: %s', (stderr) => expect(classifyDockerFailure({ stderr }).reason).toBe('daemonDown'))
  it('other errors use the first line', () => {
    expect(classifyDockerFailure({ stderr: 'Error response from daemon: No such container: x\n' })).toEqual({
      ok: false,
      reason: 'error',
      message: 'Docker: No such container: x'
    })
  })
  it('timeout', () => expect(classifyDockerFailure({ killed: true }).message).toMatch(/a tempo/))
})
