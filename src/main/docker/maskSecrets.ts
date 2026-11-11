const SECRET_NAME = /(password|passwd|secret|token|key|credential)/i
const ENV_ASSIGN = /([A-Za-z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|KEY|CREDENTIAL)[A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi
const URL_CREDENTIALS = /(:\/\/[^\s/:@]+:)[^\s@/]+@/g

/**
 * Hides values that look like secrets in the container command arguments (`--password=x`, `--token x`,
 * `API_KEY=x`, `://user:password@host`): the command goes to the screen and to the Claude prompt.
 */
export function maskCommandArgs(parts: readonly string[]): string[] {
  const out: string[] = []
  let maskNext = false
  for (const part of parts) {
    if (maskNext) {
      maskNext = false
      if (!part.startsWith('-')) {
        out.push('***')
        continue
      }
    }
    const flag = /^(-{1,2}[\w-]+)(=(.*))?$/s.exec(part)
    if (flag && SECRET_NAME.test(flag[1] ?? '')) {
      if (flag[2] !== undefined) out.push(`${flag[1]}=***`)
      else {
        out.push(part)
        maskNext = true
      }
      continue
    }
    out.push(part.replace(ENV_ASSIGN, '$1=***').replace(URL_CREDENTIALS, '$1***@'))
  }
  return out
}
