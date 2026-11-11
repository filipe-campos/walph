import { describe, expect, it } from 'vitest'
import type { DockerContainer, DockerLogLine, DockerStatsSample } from '@shared/types'
import {
  appendLogLines,
  clampPercent,
  countProblems,
  formatLogTime,
  formatPercent,
  groupContainers,
  isInWorkspace,
  isProblem,
  matchesQuery,
  isLikelyHttpPort,
  portLabel,
  problemDescription,
  sparklinePoints,
  statusOf,
  summarize,
  webPorts,
  type DockerLogsView
} from './dockerContainers'

function make(over: Partial<DockerContainer> = {}): DockerContainer {
  return {
    id: 'abc123abc123',
    name: 'web-1',
    image: 'nginx:latest',
    state: 'running',
    status: 'Up 2 hours',
    health: null,
    ports: [],
    uptime: '2 horas',
    project: null,
    service: null,
    workingDir: null,
    ...over
  }
}

const opts = { query: '', filter: 'all' as const, root: null, platform: 'linux', standaloneLabel: 'Avulsos' }

describe('isProblem', () => {
  it('unhealthy or restarting', () => {
    expect(isProblem(make({ health: 'unhealthy' }))).toBe(true)
    expect(isProblem(make({ state: 'restarting' }))).toBe(true)
    expect(isProblem(make({ health: 'healthy' }))).toBe(false)
    expect(isProblem(make({ state: 'exited' }))).toBe(false)
  })
})

describe('matchesQuery', () => {
  const c = make({
    name: 'api-1',
    image: 'node:20',
    ports: [{ hostIp: '0.0.0.0', hostPort: 3000, containerPort: 80, protocol: 'tcp' }]
  })
  it('name, image and ports', () => {
    expect(matchesQuery(c, 'API')).toBe(true)
    expect(matchesQuery(c, 'node')).toBe(true)
    expect(matchesQuery(c, '3000')).toBe(true)
    expect(matchesQuery(c, '80')).toBe(true)
    expect(matchesQuery(c, 'redis')).toBe(false)
    expect(matchesQuery(c, '  ')).toBe(true)
  })
})

describe('groupContainers', () => {
  const list = [
    make({ id: '1', name: 'z-db', project: 'zeta', service: 'db', workingDir: '/other/zeta' }),
    make({ id: '2', name: 'app-web', project: 'app', service: 'web', workingDir: '/work/app' }),
    make({ id: '3', name: 'app-db', project: 'app', service: 'db', workingDir: '/work/app', state: 'exited' }),
    make({ id: '4', name: 'solo' }),
    make({ id: '5', name: 'alpha-1', project: 'alpha', workingDir: '/other/alpha' })
  ]

  it('workspace projects first, standalone ones last', () => {
    const groups = groupContainers(list, { ...opts, root: '/work' })
    expect(groups.map((g) => g.label)).toEqual(['app', 'alpha', 'zeta', 'Avulsos'])
    expect(groups[0].inWorkspace).toBe(true)
    expect(groups[0].containers.map((c) => c.service)).toEqual(['db', 'web'])
  })

  it('counts N/M running over the whole project, even filtered', () => {
    const [app] = groupContainers(list, { ...opts, root: '/work', filter: 'running' })
    expect(app.containers).toHaveLength(1)
    expect(app.total).toBe(2)
    expect(app.running).toBe(1)
  })

  it('the Stopped filter and the search omit empty groups', () => {
    expect(groupContainers(list, { ...opts, filter: 'stopped' }).map((g) => g.label)).toEqual(['app'])
    expect(groupContainers(list, { ...opts, query: 'solo' }).map((g) => g.label)).toEqual(['Avulsos'])
  })

  it('restarting counts as running in the filter', () => {
    const g = groupContainers([make({ state: 'restarting' })], { ...opts, filter: 'running' })
    expect(g).toHaveLength(1)
  })
})

describe('isInWorkspace', () => {
  it('compares by folder prefix', () => {
    expect(isInWorkspace('/work/app', '/work', 'linux')).toBe(true)
    expect(isInWorkspace('/work', '/work/', 'linux')).toBe(true)
    expect(isInWorkspace('/workshop', '/work', 'linux')).toBe(false)
    expect(isInWorkspace('/Work/App', '/work', 'darwin')).toBe(true)
    expect(isInWorkspace('/Work/App', '/work', 'linux')).toBe(false)
    expect(isInWorkspace(null, '/work', 'linux')).toBe(false)
    expect(isInWorkspace('C:\\Dev\\app', 'c:/dev', 'win32')).toBe(true)
  })
})

describe('summarize', () => {
  it('sums CPU and memory only of those running', () => {
    const stats: Record<string, DockerStatsSample> = {
      a: { id: 'a', cpuPercent: 10, memUsage: 100, memLimit: 0, memPercent: 1, cpuHistory: [] },
      b: { id: 'b', cpuPercent: 5, memUsage: 50, memLimit: 0, memPercent: 1, cpuHistory: [] }
    }
    const s = summarize(
      [make({ id: 'a' }), make({ id: 'b', state: 'exited' }), make({ id: 'c', health: 'unhealthy' })],
      stats
    )
    expect(s).toMatchObject({ total: 3, running: 2, stopped: 1, problems: 1, cpu: 10, memUsage: 100 })
  })

  it('countProblems tolerates a null list', () => {
    expect(countProblems(null)).toBe(0)
    expect(countProblems({ containers: [make({ state: 'restarting' })], workspaceComposeFile: null })).toBe(1)
  })
})

describe('statusOf', () => {
  it('labels by text and tone', () => {
    expect(statusOf(make({ health: 'unhealthy' }))).toEqual({ label: 'Não saudável', tone: 'danger' })
    expect(statusOf(make({ health: 'healthy' })).label).toBe('Saudável')
    expect(statusOf(make({ health: 'starting' })).tone).toBe('warn')
    expect(statusOf(make({ state: 'exited' }))).toEqual({ label: 'Parado', tone: 'idle' })
    expect(statusOf(make({ state: 'restarting' })).label).toBe('Reiniciando')
  })
})

describe('problemDescription', () => {
  it('pt-BR for unhealthy and restarting', () => {
    expect(problemDescription(make({ health: 'unhealthy', uptime: '2 horas' }))).toBe(
      'Não saudável · rodando há 2 horas'
    )
    expect(problemDescription(make({ health: 'unhealthy', uptime: null }))).toBe('Não saudável')
    expect(problemDescription(make({ state: 'restarting' }))).toBe('Reiniciando em loop')
  })
})

describe('ports', () => {
  const ports = [
    { hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' as const },
    { hostIp: '::', hostPort: 8080, containerPort: 80, protocol: 'tcp' as const },
    { hostIp: '0.0.0.0', hostPort: 5353, containerPort: 53, protocol: 'udp' as const },
    { hostIp: null, hostPort: null, containerPort: 9000, protocol: 'tcp' as const }
  ]
  it('webPorts: only published TCP, without repeats', () => {
    expect(webPorts(ports)).toEqual([{ port: 8080, url: 'http://localhost:8080' }])
  })
  it('isLikelyHttpPort: web yes, databases and queues no', () => {
    for (const p of [80, 443, 3000, 5173, 8080, 8443, 9200]) expect(isLikelyHttpPort(p)).toBe(true)
    for (const p of [6379, 5432, 3306, 27017, 5672, 9092, 22, 53]) expect(isLikelyHttpPort(p)).toBe(false)
  })
  it('webPorts ignores a published Redis', () => {
    expect(webPorts([{ hostIp: '0.0.0.0', hostPort: 6379, containerPort: 6379, protocol: 'tcp' }])).toEqual([])
  })
  it('portLabel', () => {
    expect(ports.map(portLabel)).toEqual(['8080:80', '8080:80', '5353:53/udp', '9000'])
  })
})

describe('formatting', () => {
  it('formatPercent', () => {
    expect(formatPercent(0)).toBe('0,0%')
    expect(formatPercent(3.456)).toBe('3,5%')
    expect(formatPercent(42.4)).toBe('42%')
    expect(formatPercent(-1)).toBe('0%')
  })
  it('clampPercent', () => {
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(-3)).toBe(0)
    expect(clampPercent(33.4)).toBe(33)
  })
  it('formatLogTime', () => {
    expect(formatLogTime(null)).toBe('')
    expect(formatLogTime('lixo')).toBe('')
    expect(formatLogTime('2026-01-02T03:04:05Z')).toMatch(/^\d\d:\d\d:\d\d$/)
  })
})

describe('sparklinePoints', () => {
  it('empty becomes a flat line at the bottom', () => {
    expect(sparklinePoints([], 60, 16)).toBe('0,16 60,16')
  })
  it('one point per value, inside the box', () => {
    const pts = sparklinePoints([0, 50, 100], 60, 16).split(' ')
    expect(pts).toHaveLength(3)
    expect(pts[0].startsWith('0,')).toBe(true)
    expect(pts[2].startsWith('60,')).toBe(true)
    for (const p of pts) {
      const y = Number(p.split(',')[1])
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(16)
    }
  })
})

describe('appendLogLines', () => {
  const line = (text: string): DockerLogLine => ({ time: null, text, level: 'info', stream: 'stdout' })
  const view: DockerLogsView = { id: 'a', seq: 1, lines: [line('1'), line('2')], offset: 0, ended: false, error: null }

  it('appends', () => {
    const next = appendLogLines(view, [line('3')])
    expect(next.lines.map((l) => l.text)).toEqual(['1', '2', '3'])
    expect(next.offset).toBe(0)
  })
  it('respects the cap counting the dropped ones', () => {
    const next = appendLogLines(view, [line('3'), line('4')], 3)
    expect(next.lines.map((l) => l.text)).toEqual(['2', '3', '4'])
    expect(next.offset).toBe(1)
  })
  it('an empty batch returns the same reference', () => {
    expect(appendLogLines(view, [])).toBe(view)
  })
})
