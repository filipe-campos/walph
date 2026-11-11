// Formats Electron accelerators (`CmdOrCtrl+Shift+P`) for display according to the OS. Shared: the renderer
// (palette, tooltips) and main (hint in the menu label) show the same text.
const MAC_ORDER = ['ctrl', 'alt', 'shift', 'cmd'] as const
type Mod = (typeof MAC_ORDER)[number]

const MAC_SYMBOL: Record<Mod, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', cmd: '⌘' }
const OTHER_LABEL: Record<Mod, string> = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', cmd: 'Meta' }
const OTHER_ORDER: Mod[] = ['ctrl', 'alt', 'shift', 'cmd']

function modifier(part: string, isMac: boolean): Mod | null {
  switch (part.toLowerCase()) {
    case 'cmdorctrl':
    case 'commandorcontrol':
      return isMac ? 'cmd' : 'ctrl'
    case 'cmd':
    case 'command':
    case 'super':
    case 'meta':
      return 'cmd'
    case 'ctrl':
    case 'control':
      return 'ctrl'
    case 'alt':
    case 'option':
      return 'alt'
    case 'shift':
      return 'shift'
    default:
      return null
  }
}

function formatKey(key: string): string {
  if (key.toLowerCase() === 'plus') return '+'
  return key.length === 1 ? key.toUpperCase() : key
}

function formatStroke(accelerator: string, platform: string): string {
  const isMac = platform === 'darwin'
  // `Ctrl++` would be ambiguous in the split; the accelerator uses `Plus`, but we accept the trailing '+' to be safe.
  const parts = accelerator.replace(/\+\+$/, '+Plus').split('+')
  const mods = new Set<Mod>()
  let key = ''
  for (const part of parts) {
    const mod = modifier(part, isMac)
    if (mod) mods.add(mod)
    else key = formatKey(part)
  }
  if (isMac)
    return (
      MAC_ORDER.filter((m) => mods.has(m))
        .map((m) => MAC_SYMBOL[m])
        .join('') + key
    )
  return [...OTHER_ORDER.filter((m) => mods.has(m)).map((m) => OTHER_LABEL[m]), key].join('+')
}

/** Formats a shortcut; chords (`Ctrl+K S`) have each stroke formatted and separated by a space. */
export function formatKeybinding(accelerator: string, platform: string): string {
  return accelerator
    .trim()
    .split(/\s+/)
    .map((stroke) => formatStroke(stroke, platform))
    .join(' ')
}
