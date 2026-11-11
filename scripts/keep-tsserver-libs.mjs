import { basename, dirname } from 'node:path'

// Without the lib.*.d.ts tsserver knows no built-in type (string, Promise, JSON...).
export default function onNodeModuleFile(file) {
  const dir = dirname(file)
  const name = basename(file)
  return (
    basename(dir) === 'lib' &&
    basename(dirname(dir)) === 'tsserver-bundled' &&
    name.startsWith('lib.') &&
    name.endsWith('.d.ts')
  )
}
