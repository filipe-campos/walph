import { describe, expect, it } from 'vitest'
import { isProgressNoise, parseCloneProgressLine, sameStep, splitProgressChunk } from './cloneProgress'

describe('parseCloneProgressLine', () => {
  it.each([
    ['Receiving objects:  45% (450/1000), 1.2 MiB | 2.0 MiB/s', 'Recebendo objetos', 45],
    ['Receiving objects: 100% (1000/1000), 3.4 MiB | 2.0 MiB/s, done.', 'Recebendo objetos', 100],
    ['Resolving deltas:  12% (1/8)', 'Resolvendo deltas', 12],
    ['remote: Counting objects:  50% (5/10)', 'Contando objetos', 50],
    ['remote: Compressing objects: 100% (5/5), done.', 'Comprimindo objetos', 100],
    ['Updating files:  33% (3/9)', 'Atualizando arquivos', 33],
    ['Checking out files: 10% (1/10)', 'Atualizando arquivos', 10],
    ['remote: Enumerating objects: 10, done.', 'Enumerando objetos', null]
  ])('%s', (line, stage, percent) => {
    expect(parseCloneProgressLine(line)).toEqual({ stage, percent })
  })

  it('ignores what is not a stage', () => {
    expect(parseCloneProgressLine("Cloning into 'x'...")).toBeNull()
    expect(parseCloneProgressLine('fatal: repository not found')).toBeNull()
    expect(parseCloneProgressLine('')).toBeNull()
  })
})

describe('splitProgressChunk', () => {
  it('splits on \\r and \\n and returns the rest', () => {
    expect(splitProgressChunk('', 'a: 1%\rb: 2%\nc: 3')).toEqual({ lines: ['a: 1%', 'b: 2%'], rest: 'c: 3' })
  })

  it('joins the rest with the next chunk', () => {
    const first = splitProgressChunk('', 'Receiving obj')
    expect(first).toEqual({ lines: [], rest: 'Receiving obj' })
    expect(splitProgressChunk(first.rest, 'ects:  1% (1/100)\r')).toEqual({
      lines: ['Receiving objects:  1% (1/100)'],
      rest: ''
    })
  })

  it('treats \\r\\n as a single terminator', () => {
    expect(splitProgressChunk('', 'a\r\nb\r\n').lines).toEqual(['a', 'b'])
  })
})

describe('isProgressNoise and sameStep', () => {
  it('recognizes progress and the opening line', () => {
    expect(isProgressNoise("Cloning into 'x'...")).toBe(true)
    expect(isProgressNoise('Receiving objects: 1% (1/100)')).toBe(true)
    expect(isProgressNoise('fatal: unable to access')).toBe(false)
  })

  it('compares stage and percentage', () => {
    expect(sameStep({ stage: 'A', percent: 1 }, { stage: 'A', percent: 1 })).toBe(true)
    expect(sameStep({ stage: 'A', percent: 1 }, { stage: 'A', percent: 2 })).toBe(false)
    expect(sameStep(null, { stage: 'A', percent: 1 })).toBe(false)
  })
})

describe('parseCloneProgressLine: edges', () => {
  it('ignores case, spaces and the remote: prefix', () => {
    expect(parseCloneProgressLine('  RECEIVING OBJECTS:   7% (7/100)  ')).toEqual({
      stage: 'Recebendo objetos',
      percent: 7
    })
    expect(parseCloneProgressLine('REMOTE:   Counting objects: 3% (1/30)')).toEqual({
      stage: 'Contando objetos',
      percent: 3
    })
  })

  it('caps the percentage at 100 and accepts 0%', () => {
    expect(parseCloneProgressLine('Receiving objects: 150% (1/1)')?.percent).toBe(100)
    expect(parseCloneProgressLine('Receiving objects:   0% (0/100)')?.percent).toBe(0)
  })

  it('text that only mentions the stage in the middle is not progress', () => {
    expect(parseCloneProgressLine('fatal: Receiving objects: 5%')).toBeNull()
  })
})

describe('splitProgressChunk: edges', () => {
  it('an empty chunk keeps the rest', () => {
    expect(splitProgressChunk('abc', '')).toEqual({ lines: [], rest: 'abc' })
  })

  it('ignores empty lines between repeated terminators', () => {
    expect(splitProgressChunk('', '\r\r\na\n\n')).toEqual({ lines: ['a'], rest: '' })
  })

  it('\r and \n in separate chunks do not produce an empty line', () => {
    const first = splitProgressChunk('', 'a: 1%\r')
    const second = splitProgressChunk(first.rest, '\nb: 2%\r')
    expect([...first.lines, ...second.lines]).toEqual(['a: 1%', 'b: 2%'])
  })
})
