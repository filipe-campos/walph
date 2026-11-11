import { describe, expect, it } from 'vitest'
import { parseHealth, parseLabels, parsePs, parseUptime } from './parsePs'
import { dedupePorts, parsePortEntry } from './ports'

const line = (o: Record<string, string>): string =>
  JSON.stringify({
    ID: 'abcdef123456',
    Image: 'nginx',
    Names: 'web',
    State: 'running',
    Status: 'Up 2 hours',
    Labels: '',
    Ports: '',
    ...o
  })

describe('parsePs', () => {
  it('reads compose project, service, folder and files (with a comma in the value)', () => {
    const labels =
      'com.docker.compose.project=shop,com.docker.compose.service=db,com.docker.compose.project.working_dir=/src/shop,com.docker.compose.project.config_files=/src/shop/compose.yml,/src/shop/override.yml,maintainer=x'
    const [c] = parsePs(line({ Labels: labels, Names: '/shop-db-1' }))
    expect(c).toMatchObject({
      project: 'shop',
      service: 'db',
      workingDir: '/src/shop',
      name: 'shop-db-1',
      id: 'abcdef123456'
    })
    expect(c.configFiles).toEqual(['/src/shop/compose.yml', '/src/shop/override.yml'])
  })

  it('output without compose: project null', () => {
    const [c] = parsePs(line({ Labels: 'a=b' }))
    expect(c.project).toBeNull()
    expect(c.workingDir).toBeNull()
    expect(c.configFiles).toEqual([])
  })

  it('container without health and with health', () => {
    expect(parsePs(line({}))[0].health).toBeNull()
    expect(parsePs(line({ Status: 'Up 3 minutes (unhealthy)' }))[0].health).toBe('unhealthy')
    expect(parseHealth('Up 5 seconds (health: starting)')).toBe('starting')
    expect(parseHealth('Up 1 hour (healthy)')).toBe('healthy')
  })

  it('ignores malformed lines and invalid ids; short id = 12 chars', () => {
    const out = parsePs(`lixo\n\n${line({ ID: 'abcdef1234567890abcdef' })}\n${line({ ID: 'zz' })}\n{"a":1}`)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('abcdef123456')
  })

  it('uppercase and unknown state', () => {
    expect(parsePs(line({ State: 'Running' }))[0].state).toBe('running')
    expect(parsePs(line({ State: 'weird' }))[0].state).toBe('exited')
  })

  it('uptime only for running', () => {
    expect(parsePs(line({}))[0].uptime).toBe('2 horas')
    expect(parsePs(line({ State: 'exited', Status: 'Exited (1) 3 minutes ago' }))[0].uptime).toBeNull()
  })
})

describe('parseUptime', () => {
  it.each([
    ['Up 2 hours', '2 horas'],
    ['Up 1 second', '1 segundo'],
    ['Up 45 seconds (healthy)', '45 segundos'],
    ['Up About an hour', 'cerca de 1 hora'],
    ['Up About a minute', 'cerca de 1 minuto'],
    ['Up Less than a second', 'menos de 1 segundo'],
    ['Up 3 days', '3 dias'],
    ['Up 2 months', '2 meses'],
    ['Up 1 year', '1 ano']
  ])('%s', (status, expected) => expect(parseUptime(status)).toBe(expected))
  it('is not up', () => expect(parseUptime('Exited (0) 2 hours ago')).toBeNull())
})

describe('parseLabels', () => {
  it('a path with = continues the value', () => {
    expect(parseLabels('a=b,com.docker.compose.project.config_files=/x/a.yml,/y/b=c.yml,z=1')).toEqual({
      a: 'b',
      'com.docker.compose.project.config_files': '/x/a.yml,/y/b=c.yml',
      z: '1'
    })
  })
  it('empty', () => expect(parseLabels('')).toEqual({}))
})

describe('ports', () => {
  it('IPv4 + IPv6 of the same mapping become one', () => {
    const ports = ['0.0.0.0:8080->80/tcp', ':::8080->80/tcp', '[::]:443->443/tcp', '5432/tcp'].flatMap(parsePortEntry)
    const out = dedupePorts(ports)
    expect(out).toEqual([
      { hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
      { hostIp: '::', hostPort: 443, containerPort: 443, protocol: 'tcp' },
      { hostIp: null, hostPort: null, containerPort: 5432, protocol: 'tcp' }
    ])
  })
  it('IPv6 before IPv4 keeps the IPv4', () => {
    const out = dedupePorts(['[::]:80->80/tcp', '0.0.0.0:80->80/tcp'].flatMap(parsePortEntry))
    expect(out).toHaveLength(1)
    expect(out[0].hostIp).toBe('0.0.0.0')
  })
  it('ranges and udp; garbage ignored', () => {
    expect(
      parsePortEntry('127.0.0.1:8000-8001->9000-9001/udp').map((p) => [p.hostPort, p.containerPort, p.protocol])
    ).toEqual([
      [8000, 9000, 'udp'],
      [8001, 9001, 'udp']
    ])
    expect(parsePortEntry('abc')).toEqual([])
    expect(parsePortEntry('')).toEqual([])
  })
  it('Ports of the whole ps', () => {
    const [c] = parsePs(line({ Ports: '0.0.0.0:8080->80/tcp, :::8080->80/tcp, 5432/tcp, [::]:443->443/tcp' }))
    expect(c.ports.map((p) => p.containerPort)).toEqual([80, 5432, 443])
  })
})
