import { describe, expect, it } from 'vitest'
import { pickDockerExecutable } from './executable'

const files =
  (...paths: string[]) =>
  (p: string) =>
    paths.includes(p)

describe('pickDockerExecutable', () => {
  it('empty looks for "docker" in the PATH', () => {
    expect(pickDockerExecutable('', '/usr/bin:/usr/local/bin', 'linux', files('/usr/local/bin/docker'))).toBe(
      '/usr/local/bin/docker'
    )
    expect(pickDockerExecutable('   ', '/usr/bin', 'linux', files('/usr/bin/docker'))).toBe('/usr/bin/docker')
  })
  it('an existing absolute path is used as is, without looking at the PATH', () => {
    expect(pickDockerExecutable('/opt/fake/docker', '/usr/bin', 'linux', files('/opt/fake/docker'))).toBe(
      '/opt/fake/docker'
    )
  })
  it('a missing absolute path throws ENOENT in pt-BR', () => {
    try {
      pickDockerExecutable('/opt/missing/docker', '/usr/bin', 'linux', files('/usr/bin/docker'))
      expect.unreachable()
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT')
      expect((err as Error).message).toContain('/opt/missing/docker')
    }
  })
  it('a bare name is looked up in the PATH', () => {
    expect(pickDockerExecutable('podman', '/a:/b', 'linux', files('/b/podman'))).toBe('/b/podman')
  })
  it('not found in the PATH: ENOENT', () => {
    expect(() => pickDockerExecutable('', '/a:/b', 'linux', files())).toThrow(/não encontrado/)
  })
  it('Windows: a path with drive and backslash is absolute', () => {
    const p = 'C:\\Program Files\\Docker\\docker.exe'
    expect(pickDockerExecutable(p, '', 'win32', files(p))).toBe(p)
  })
  it('Windows: looks for docker.exe in the PATH folders separated by semicolons', () => {
    const exe = 'C:\\Docker\\docker.exe'
    expect(pickDockerExecutable('', 'C:\\Windows;C:\\Docker', 'win32', files(exe))).toBe(exe)
  })
})
