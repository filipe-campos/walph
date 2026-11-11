# Menu

Dropdown list of actions or of a single choice, anchored to a button: execution mode, model and effort and the session ⋯ menu in `ClaudePanel`, and any context menu in the IDE.

**The consumer provides:** `open`, `onClose`, `items` (`id`, `label`, `description`, `icon`, `shortcut`, `checked`, `danger`, or `divider` / `header`), `onSelect(id)`, `placement` and `anchorRef` (the button that opened it). `children` goes after the items, for example the segmented effort selector (`<div class="wp-seg">`). The menu positions itself inside a `position: relative` wrapper (`.wp-pop`).

- Background `bg-300`, border `line`, `shadow-pop`, radius `radius-lg`. It enters rising (or dropping) 4px and scaling from 0.98 in `duration-base` + `ease-out`, from the button's corner.
- Items with `checked` are `menuitemradio` with a ✓ in `accent`; `danger` paints text and icon coral, always last, after a divider.
- Keyboard: opens with focus on the checked item (or the first), ↑ ↓ navigate, Enter chooses, Esc closes and returns focus to the button. Clicking outside closes.
