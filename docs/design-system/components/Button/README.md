# Button

Action button in four variants: `primary` (`--grad-brand` gradient, at most one per area), `secondary` (`line-strong` border), `ghost` (bar and toolbar actions) and `danger` (the destructive action of a confirmation, `danger` background and `on-accent` text).

**The consumer provides:** `children` (verb first, sentence case: "Abrir pasta"), `variant`, `size` (`md` 28px, `sm` 24px, `xs` 22px with caption text, for actions inside rows), an optional `icon` by name and any `<button>` attribute.

- Hover in `duration-instant`; press shrinks to 0.97. On `primary`, a band of light sweeps across the button once (`duration-sheen`) and `shadow-glow` comes in.
- `primary` has a 1px thread of light at the top (inset) so it looks polished, not flat.
- Text and icon on the gradient are always `on-accent`, never white: AI icons lose their gradient inside it.
