# Select

Single choice among known options, with Walph's own list: the button opens a floating panel in the style of the IDE menus, instead of the system's native list.

**The consumer provides:** `options` (strings or `{ value, label, description?, icon?, hint?, disabled? }`, plus `{ header }` for group titles and `{ divider: true }` for separators), `value` or `defaultValue`, `onChange(event, value)` (the event carries `target.value`, as in `<select>`), `placeholder`, `size` (`'md'` 30px · `'sm'` 26px), `disabled`, `name` (generates a hidden `input` for forms) and `aria-label` when there is no visible label.

- **Trigger:** 30px, background `bg-100`, border `line-strong`, value in `ink`, chevron `ink-muted`. Hover: `bg-200`. Open: `accent` border, 3px ring at 18% `accent` and the chevron turns upward in `accent`. Keyboard focus: `focus-ring`.
- **List:** `bg-300` panel with `radius-lg`, `line` outline and `shadow-pop`, at least the trigger width (up to 360px wide and 300px tall, with scrolling). It opens downward dropping 4px (`duration-base`, `ease-out`) and upward when space runs out. It is rendered in `body`, so modals and scrolling panels do not clip it.
- **Options:** 30px, text `ink-muted`; the active one (mouse or arrows) gets `bg-400` and `ink`; the selected one has its label in 500, a 2px `--grad-brand` stroke on the left and an `accent` ✓ on the right. Description in `ink-faint` below the label; optional icon on the left (turns `accent` on the active and selected ones); disabled at 40%.
- **Keyboard:** Enter, Space or ↑ ↓ open; ↑ ↓ Home End navigate; Enter or Space choose; Esc closes and returns focus; Tab closes; typing the first letters jumps to the option (with the list closed, it already chooses). Clicking outside closes.
- **Accessibility:** `role="combobox"` on the trigger with `aria-expanded` and `aria-activedescendant`; the list is a `listbox` with `option` and `aria-selected`.
- Short, sentence-case labels ("Sempre perguntar"). More than ~10 options or search: use `CommandPalette`.
