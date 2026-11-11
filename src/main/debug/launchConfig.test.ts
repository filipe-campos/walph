import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  asLaunchConfig,
  builtinConfigs,
  forPlatform,
  launchFileTemplate,
  parseLaunchFile,
  substituteVariables,
  summarize,
  type SubstitutionContext
} from './launchConfig'

const ctx: SubstitutionContext = {
  root: '/w/proj',
  file: '/w/proj/src/app.py',
  line: 12,
  selectedText: 'x + 1',
  env: { HOME: '/home/u', PORT: '9229' },
  home: '/home/u'
}

describe('parseLaunchFile', () => {
  it('reads JSONC with comments and a trailing comma', () => {
    const text = `{
      // configuration
      "version": "0.2.0",
      "configurations": [
        { "name": "App", "type": "python", "request": "launch", "program": "\${file}", },
        "junk",
      ]
    }`
    const parsed = parseLaunchFile(text)
    expect(parsed.error).toBeNull()
    expect(parsed.configurations).toEqual([{ name: 'App', type: 'python', request: 'launch', program: '${file}' }])
  })

  it('an empty file is not an error; broken JSON or a wrong format is', () => {
    expect(parseLaunchFile('  // nothing\n')).toEqual({ configurations: [], error: null })
    expect(parseLaunchFile('{ "configurations": [ }').error).toMatch(/launch\.json/)
    expect(parseLaunchFile('[]').error).toMatch(/configurations/)
    expect(parseLaunchFile('{ "configurations": {} }').error).toMatch(/configurations/)
  })
})

describe('configurations', () => {
  it('applies the OS override and removes the OS keys', () => {
    const raw = {
      name: 'A',
      type: 'node',
      request: 'launch',
      program: 'a',
      osx: { program: 'mac' },
      windows: { program: 'win' }
    }
    expect(forPlatform(raw, 'darwin')).toEqual({ name: 'A', type: 'node', request: 'launch', program: 'mac' })
    expect(forPlatform(raw, 'win32').program).toBe('win')
    expect(forPlatform(raw, 'linux').program).toBe('a')
  })

  it('summarizes only the valid ones, without repeated names', () => {
    const list = summarize(
      [
        { name: 'A', type: 'python', request: 'launch' },
        { name: 'A', type: 'node', request: 'attach' },
        { name: 'B', type: 'node', request: 'oops' },
        { type: 'node', request: 'launch' },
        { name: 'C', type: 'node', request: 'attach' }
      ],
      'linux'
    )
    expect(list).toEqual([
      { name: 'A', type: 'python', request: 'launch', builtin: false },
      { name: 'C', type: 'node', request: 'attach', builtin: false }
    ])
    expect(asLaunchConfig({ name: 'X', type: 'python' })).toBeNull()
  })

  it('the launch.json template is valid JSON with the default configurations', () => {
    const parsed = JSON.parse(launchFileTemplate()) as { configurations: unknown[] }
    expect(parsed.configurations).toEqual(builtinConfigs())
  })
})

describe('substituteVariables', () => {
  it('replaces the common variables in depth', () => {
    const out = substituteVariables(
      {
        program: '${file}',
        cwd: '${workspaceFolder}',
        args: ['${relativeFile}', '${fileDirname}', '${fileBasenameNoExtension}${fileExtname}', '--line=${lineNumber}'],
        env: { PORT: '${env:PORT}', NONE: '${env:MISSING}', SEL: '${selectedText}' },
        nested: { name: '${workspaceFolderBasename}', home: '${userHome}', other: '${workspaceFolder:proj}' },
        count: 3
      },
      ctx
    )
    expect(out).toEqual({
      program: '/w/proj/src/app.py',
      cwd: '/w/proj',
      args: [join('src', 'app.py'), '/w/proj/src', 'app.py', '--line=12'],
      env: { PORT: '9229', NONE: '', SEL: 'x + 1' },
      nested: { name: 'proj', home: '/home/u', other: '/w/proj' },
      count: 3
    })
  })

  it('a file variable without an open file and an unsupported variable throw', () => {
    expect(() => substituteVariables({ p: '${file}' }, { ...ctx, file: null })).toThrow(/arquivo aberto/)
    expect(() => substituteVariables({ p: '${command:pickProcess}' }, ctx)).toThrow(/command:pickProcess/)
    expect(() => substituteVariables({ p: '${input:x}' }, ctx)).toThrow(/não é suportada/)
  })
})
