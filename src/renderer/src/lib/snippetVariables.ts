// Values of the VS Code snippet variables (`TM_FILENAME`, `CURRENT_YEAR`, `UUID`…) from a context already
// collected by the editor. Pure: date, randomness and clipboard come in through the context.
import { formatDate } from '@shared/i18n'
import { basename, dirname, relativeTo } from './path'

export interface SnippetContext {
  /** Absolute path of the file (`null` = tab without a file). */
  filePath: string | null
  /** View folder (`null` = no folder). */
  root: string | null
  selectedText: string
  currentLine: string
  currentWord: string
  /** Cursor line, 0-based. */
  lineIndex: number
  clipboard: string
  lineComment?: string | undefined
  blockComment?: { open: string; close: string } | undefined
  now: Date
  /** Number in [0, 1), like `Math.random`. */
  random: () => number
  uuid: () => string
}

const pad = (n: number, size = 2): string => String(n).padStart(size, '0')

function randomDigits(random: () => number, count: number, radix: number): string {
  let out = ''
  for (let i = 0; i < count; i++) out += Math.floor(random() * radix).toString(radix)
  return out
}

function timezoneOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** Variable value; `undefined` = unknown (the snippet turns it into a placeholder with the name). */
export function snippetVariable(name: string, ctx: SnippetContext): string | undefined {
  const { filePath, root, now } = ctx
  switch (name) {
    case 'TM_SELECTED_TEXT':
      return ctx.selectedText
    case 'TM_CURRENT_LINE':
      return ctx.currentLine
    case 'TM_CURRENT_WORD':
      return ctx.currentWord
    case 'TM_LINE_INDEX':
      return String(ctx.lineIndex)
    case 'TM_LINE_NUMBER':
      return String(ctx.lineIndex + 1)
    case 'TM_FILENAME':
      return filePath ? basename(filePath) : ''
    case 'TM_FILENAME_BASE': {
      if (!filePath) return ''
      const file = basename(filePath)
      const dot = file.lastIndexOf('.')
      return dot > 0 ? file.slice(0, dot) : file
    }
    case 'TM_DIRECTORY':
      return filePath ? dirname(filePath) : ''
    case 'TM_FILEPATH':
      return filePath ?? ''
    case 'RELATIVE_FILEPATH':
      return filePath ? (root ? relativeTo(root, filePath) : filePath) : ''
    case 'CLIPBOARD':
      return ctx.clipboard
    case 'WORKSPACE_NAME':
      return root ? basename(root) : ''
    case 'WORKSPACE_FOLDER':
      return root ?? ''
    case 'CURRENT_YEAR':
      return String(now.getFullYear())
    case 'CURRENT_YEAR_SHORT':
      return pad(now.getFullYear() % 100)
    case 'CURRENT_MONTH':
      return pad(now.getMonth() + 1)
    case 'CURRENT_MONTH_NAME':
      return formatDate(now, { month: 'long' })
    case 'CURRENT_MONTH_NAME_SHORT':
      return formatDate(now, { month: 'short' })
    case 'CURRENT_DATE':
      return pad(now.getDate())
    case 'CURRENT_DAY_NAME':
      return formatDate(now, { weekday: 'long' })
    case 'CURRENT_DAY_NAME_SHORT':
      return formatDate(now, { weekday: 'short' })
    case 'CURRENT_HOUR':
      return pad(now.getHours())
    case 'CURRENT_MINUTE':
      return pad(now.getMinutes())
    case 'CURRENT_SECOND':
      return pad(now.getSeconds())
    case 'CURRENT_SECONDS_UNIX':
      return String(Math.floor(now.getTime() / 1000))
    case 'CURRENT_TIMEZONE_OFFSET':
      return timezoneOffset(now)
    case 'RANDOM':
      return randomDigits(ctx.random, 6, 10)
    case 'RANDOM_HEX':
      return randomDigits(ctx.random, 6, 16)
    case 'UUID':
      return ctx.uuid()
    // Without a line comment (CSS, HTML), VS Code uses the block one.
    case 'LINE_COMMENT':
      return ctx.lineComment ?? ctx.blockComment?.open ?? ''
    case 'BLOCK_COMMENT_START':
      return ctx.blockComment?.open ?? ''
    case 'BLOCK_COMMENT_END':
      return ctx.blockComment?.close ?? ''
    default:
      return undefined
  }
}
