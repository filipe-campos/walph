import { describe, expect, it } from 'vitest'
import { dedupePorts, parsePortEntry } from './ports'

describe('parsePortEntry', () => {
  it('port published on IPv4', () => {
    expect(parsePortEntry('0.0.0.0:8080->80/tcp')).toEqual([
      { hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' }
    ])
  })
  it('IPv6 without brackets (:::) and with brackets ([::])', () => {
    expect(parsePortEntry(':::8080->80/tcp')[0]).toMatchObject({ hostIp: '::', hostPort: 8080 })
    expect(parsePortEntry('[::1]:5432->5432/tcp')[0]).toMatchObject({ hostIp: '::1', hostPort: 5432 })
  })
  it('empty host IP becomes 0.0.0.0', () => {
    expect(parsePortEntry('8080->80/tcp')[0]).toMatchObject({ hostIp: '0.0.0.0', hostPort: 8080 })
  })
  it('exposed but unpublished port has no host', () => {
    expect(parsePortEntry('5432/tcp')).toEqual([{ hostIp: null, hostPort: null, containerPort: 5432, protocol: 'tcp' }])
  })
  it('default protocol is tcp; udp and sctp are accepted; unknown is ignored', () => {
    expect(parsePortEntry('80')[0].protocol).toBe('tcp')
    expect(parsePortEntry('53/udp')[0].protocol).toBe('udp')
    expect(parsePortEntry('9/sctp')[0].protocol).toBe('sctp')
    expect(parsePortEntry('80/icmp')).toEqual([])
  })
  it('a range becomes one port per number', () => {
    expect(parsePortEntry('0.0.0.0:8000-8002->8000-8002/tcp').map((p) => [p.hostPort, p.containerPort])).toEqual([
      [8000, 8000],
      [8001, 8001],
      [8002, 8002]
    ])
  })
  it('a smaller host range repeats the last port', () => {
    expect(parsePortEntry('0.0.0.0:80->80-81/tcp').map((p) => p.hostPort)).toEqual([80, 80])
  })
  it('a huge range is cut to 64 ports', () => {
    expect(parsePortEntry('1-60000/tcp')).toHaveLength(64)
  })
  it('garbage, an inverted range and a port above 65535 become an empty list', () => {
    for (const bad of ['', '   ', 'abc', '90-80/tcp', '70000/tcp', '0.0.0.0:x->80/tcp', '0.0.0.0:80->y/tcp'])
      expect(parsePortEntry(bad)).toEqual([])
  })
})

describe('dedupePorts', () => {
  it('keeps only the IPv4 when the IPv6 mirrors the mapping, in any order', () => {
    const v4 = parsePortEntry('0.0.0.0:80->80/tcp')
    const v6 = parsePortEntry(':::80->80/tcp')
    expect(dedupePorts([...v4, ...v6])).toEqual(v4)
    expect(dedupePorts([...v6, ...v4])).toEqual(v4)
  })
  it('different protocols on the same port are distinct mappings', () => {
    const ports = ['0.0.0.0:53->53/tcp', '0.0.0.0:53->53/udp'].flatMap(parsePortEntry)
    expect(dedupePorts(ports)).toHaveLength(2)
  })
  it('IPv6 only still exists', () => {
    expect(dedupePorts(parsePortEntry(':::80->80/tcp'))).toHaveLength(1)
  })
})
