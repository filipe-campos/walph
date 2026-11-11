import { describe, expect, it } from 'vitest'
import { parseInspect } from './parseInspect'

const base = {
  Id: 'abcdef1234567890abcdef',
  Name: '/web',
  Created: '2026-10-17T10:00:00Z',
  RestartCount: 3,
  State: {
    Status: 'running',
    Running: true,
    ExitCode: 0,
    Health: { Status: 'unhealthy', FailingStreak: 4, Log: [{ Output: 'curl: (7) refused\n' }] }
  },
  Config: {
    Image: 'nginx:1',
    Entrypoint: ['/docker-entrypoint.sh'],
    Cmd: ['nginx', '-g', 'daemon off;'],
    Env: ['A=1', 'SECRET=hunter2']
  },
  NetworkSettings: {
    Networks: { shop_default: {} },
    Ports: {
      '80/tcp': [
        { HostIp: '0.0.0.0', HostPort: '8080' },
        { HostIp: '::', HostPort: '8080' }
      ],
      '5432/tcp': null
    }
  },
  Mounts: [
    { Type: 'bind', Source: '/data', Destination: '/var/data', RW: false },
    { Type: 'volume', Name: 'vol', Destination: '/v', RW: true }
  ]
}

describe('parseInspect', () => {
  it('summarizes the container without env values', () => {
    const i = parseInspect(JSON.stringify([base]))
    expect(i).toMatchObject({
      id: 'abcdef123456',
      name: 'web',
      image: 'nginx:1',
      command: '/docker-entrypoint.sh nginx -g "daemon off;"',
      restartCount: 3,
      exitCode: null,
      networks: ['shop_default'],
      envCount: 2
    })
    expect(JSON.stringify(i)).not.toContain('hunter2')
    expect(i.ports).toEqual([
      { hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
      { hostIp: null, hostPort: null, containerPort: 5432, protocol: 'tcp' }
    ])
    expect(i.mounts).toEqual([
      { type: 'bind', source: '/data', destination: '/var/data', readOnly: true },
      { type: 'volume', source: 'vol', destination: '/v', readOnly: false }
    ])
    expect(i.health).toEqual({ status: 'unhealthy', failingStreak: 4, lastOutput: 'curl: (7) refused' })
  })
  it('without health, stopped with an exit code', () => {
    const i = parseInspect(
      JSON.stringify([
        {
          ...base,
          State: { Status: 'exited', Running: false, ExitCode: 137 },
          Config: { Image: 'x' },
          Path: 'sleep',
          Args: ['9']
        }
      ])
    )
    expect(i.health).toBeNull()
    expect(i.exitCode).toBe(137)
    expect(i.command).toBe('sleep 9')
    expect(i.envCount).toBe(0)
  })
  it('garbage throws in pt-BR', () => {
    expect(() => parseInspect('nope')).toThrow(/Docker/)
    expect(() => parseInspect('[]')).toThrow(/não encontrado/)
  })
})
