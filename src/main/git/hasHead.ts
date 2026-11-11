import { git } from './run'

export async function hasHead(root: string): Promise<boolean> {
  try {
    await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])
    return true
  } catch {
    return false
  }
}
