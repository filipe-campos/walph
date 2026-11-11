import { describe, expect, it } from 'vitest'
import { CPU_HISTORY, CpuHistory, StatsFrameParser, parseBytes, parsePercent, parseStatsLine } from './parseStats'

const row = (id: string, cpu: string, mem = '12.5MiB / 7.66GiB'): string =>
  JSON.stringify({ ID: id, Name: 'x', CPUPerc: cpu, MemUsage: mem, MemPerc: '0.16%' })
const CLEAR = '\x1b[2J\x1b[H'

describe('parseBytes/parsePercent', () => {
  it('units', () => {
    expect(parseBytes('12.5MiB')).toBe(13107200)
    expect(parseBytes('1.2GB')).toBe(1.2e9)
    expect(parseBytes('7.66GiB')).toBe(Math.round(7.66 * 1024 ** 3))
    expect(parseBytes('0B')).toBe(0)
    expect(parseBytes('3kB')).toBe(3000)
    expect(parseBytes('--')).toBe(0)
  })
  it('percentages', () => {
    expect(parsePercent('0.52%')).toBe(0.52)
    expect(parsePercent('--')).toBe(0)
  })
})

describe('parseStatsLine', () => {
  it('reads the sample', () => {
    expect(parseStatsLine(row('abcdef1234567890', '0.52%'))).toMatchObject({
      id: 'abcdef123456',
      cpuPercent: 0.52,
      memPercent: 0.16
    })
  })
  it('drops non-containers', () => {
    expect(parseStatsLine('oops')).toBeNull()
    expect(parseStatsLine(row('--', '1%'))).toBeNull()
  })
})

describe('StatsFrameParser', () => {
  it('groups one frame per clear-screen', () => {
    const p = new StatsFrameParser()
    const frames = p.feed(
      `${CLEAR}${row('aaaaaaaaaaaa', '1%')}\n${row('bbbbbbbbbbbb', '2%')}\n${CLEAR}${row('aaaaaaaaaaaa', '3%')}\n`
    )
    expect(frames).toHaveLength(1)
    expect(frames[0].map((s) => s.id)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])
    expect(p.flush()?.map((s) => s.cpuPercent)).toEqual([3])
    expect(p.flush()).toBeNull()
  })
  it('line split across chunks', () => {
    const p = new StatsFrameParser()
    const text = `${CLEAR}${row('aaaaaaaaaaaa', '1%')}\n`
    expect(p.feed(text.slice(0, 20))).toEqual([])
    expect(p.feed(text.slice(20))).toEqual([])
    expect(p.flush()).toHaveLength(1)
  })
  it('without a clear-screen sequence: only flush delivers', () => {
    const p = new StatsFrameParser()
    expect(p.feed(`${row('aaaaaaaaaaaa', '1%')}\n`)).toEqual([])
    expect(p.flush()).toHaveLength(1)
  })
})

describe('CpuHistory', () => {
  it('keeps the last 30 and forgets whoever disappeared', () => {
    const h = new CpuHistory()
    const sample = (id: string, cpu: number) => ({ id, cpuPercent: cpu, memUsage: 0, memLimit: 0, memPercent: 0 })
    let out = h.apply([sample('aaaaaaaaaaaa', 0), sample('bbbbbbbbbbbb', 9)])
    for (let i = 1; i <= 40; i++) out = h.apply([sample('aaaaaaaaaaaa', i)])
    expect(out[0].cpuHistory).toHaveLength(CPU_HISTORY)
    expect(out[0].cpuHistory.at(-1)).toBe(40)
    out = h.apply([sample('aaaaaaaaaaaa', 1), sample('bbbbbbbbbbbb', 5)])
    expect(out[1].cpuHistory).toEqual([5])
  })
})
