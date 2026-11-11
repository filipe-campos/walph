import type { PromptSegment } from '../../lib/claudePrompt'

/**
 * Prompt segments highlighted by kind (`claude-seg-<kind>`). Used in the chat and in the layer behind the input
 * box, which is why no highlight style may change the text width (only color/synthesized italics).
 */
export function PromptSegments({ segments }: { segments: readonly PromptSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          seg.text
        ) : (
          <span key={i} className={`claude-seg-${seg.kind}`}>
            {seg.text}
          </span>
        )
      )}
    </>
  )
}
