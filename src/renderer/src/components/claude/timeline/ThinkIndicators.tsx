import { V1, V2 } from '../../common/Logo'
import { useThinkingWord } from '../useThinkingWord'

/** Two comets run through the two Vs of the mark in opposite directions (design system, Thinking indicator). */
export function ThinkMark() {
  return (
    <svg className="claude-think-mark" viewBox="2 11 60 42" aria-hidden>
      <path className="claude-think-base" d={V2} />
      <path className="claude-think-base" d={V1} />
      <path className="claude-think-run back" d={V2} pathLength={100} />
      <path className="claude-think-run front" d={V1} pathLength={100} />
    </svg>
  )
}

/**
 * Creative word of the "Thinking" indicator: changes every ~4 s with a fade (the screen reader only hears "Pensando…").
 */
export function ThinkingWord({ seed }: { seed: string }) {
  const word = useThinkingWord(seed)
  return (
    <span key={word} className="claude-think-label rotating" aria-hidden>
      {word}
    </span>
  )
}
