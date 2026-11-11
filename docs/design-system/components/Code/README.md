# Code

Code block with the Walph syntax theme: line number gutter, active line and colored tokens. Use it in previews, diffs, documentation and to validate the real editor's theme.

**The consumer provides:** `lines` (each line is a list of segments, where a segment is plain text or `[type, text]` with `type` in `keyword`, `function`, `type`, `string`, `number`, `constant`, `property`, `tag`, `variable`, `operator`, `comment`); optional `startLine` and `activeLine`. In the real editor (Monaco), map the same `syn-*` and `editor-*` tokens to the theme.

- **Git changes** (`changes`: `{ [line]: 'added' | 'modified' | 'deleted' }`): a 3px bar between the numbers and the code (`success` for added, `syn-function` (blue) for modified) and a `danger` triangle on the line where something was removed. The same marks appear on the edge of the map.
- **Code map** (`minimap`, on by default): 72px column on the right with each line drawn as 2px strokes in the syntax colors, the active line in `accent` and a light rectangle marking the visible part. Clicking or dragging on the map scrolls the code.
- **Wider scrollbar** only in the editor: 12px, `accent` thumb at 45% (75% on hover) with rounded corners, over a transparent track. The rest of the IDE keeps the thin bar.
- Give the container a height: the code scrolls inside it.
- Default text (`syn-variable`) is `ink`; punctuation in `syn-operator` (`ink-muted`) to recede.
- Comments in `syn-comment` and italic.
- Active line in `editor-line-active`; selection in `editor-selection` (the text keeps its color); search in `editor-match`.
- Every syntax color passes 5:1 on `bg-100` and `bg-200`.
- Do not use pure `accent` in syntax: `syn-keyword` is a lighter shade, so the UI (focus, active tab) remains the strongest purple on screen.
