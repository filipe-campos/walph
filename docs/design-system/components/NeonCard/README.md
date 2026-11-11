# NeonCard

Card with a light border: a 1px gradient ring that can be static or have a neon line running around the border, Walph's "Tech Premium AI" signature.

**The consumer provides:** `trace` (`'static'` default, `'live'` or `'hover'`), `icon`, `eyebrow`, `title`, `children`, `glow` (diffuse `shadow-neon` glow underneath) and `onClick` (becomes a button and rises 2px on hover).

**When to use each mode**

- `live`: **only** when the AI is working on that thing (Claude running, generation in progress). The line makes one lap every `duration-trace` (4.2s), at constant speed (`ease-linear`), with an `accent-3` head, `accent` body and `accent-2` tail, and a blurred glow following it.
- `static`: AI result or highlight: `--grad-ring` ring (blue in one corner, cyan in the opposite one).
- `hover`: clickable cards that invite action; the line only runs while the mouse is over it.

**Rules**

- At most **three** `live` traces visible at the same time (e.g. running tab, Claude compose, one card). If everything glows, nothing glows.
- The card background is `bg-300` (variable `--wp-neon-fill`); the border is drawn on the `border-box`, so do not use your own `border` or `background` on the same element.
- An element that already has its own animation (tab entrance, toast entrance) loses the trace, because `animation` does not add up: in that case declare both in the same rule, `animation: <entrance>, wp-trace var(--duration-trace) var(--ease-linear) infinite`.
- With `prefers-reduced-motion`, the line stops and the border becomes the static `--grad-ai` gradient.
- The same technique is in `WorkspaceTab` (active and running tab), `ClaudePanel` (compose and summary), `Toast` (`done`/`info`), `CommandPalette` and `Welcome`.
