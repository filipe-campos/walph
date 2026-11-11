import { useEffect, useState } from 'react'
import { copyText } from '../../clipboard'
import { IconButton } from './IconButton'
import { useT } from '../../i18n'

/** Copies `text` and shows a check for 1.5 s. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false)
  const t = useT()
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 1500)
    return () => clearTimeout(timer)
  }, [done])
  return (
    <IconButton
      icon={done ? 'codicon-check' : 'codicon-copy'}
      label={done ? t.common.copied : label}
      className={className}
      onClick={() => void copyText(text).then((ok) => ok && setDone(true))}
    />
  )
}
