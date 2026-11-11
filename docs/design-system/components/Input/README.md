# Input

Single-line text field with optional icon and shortcut: search, command palette, branch name.

**The consumer provides:** `icon`, `shortcut` (e.g. "⌘P") and every `<input>` attribute (`value`, `onChange`, `placeholder`…).

- `line-strong` border (3:1); on focus it becomes `accent` with a `focus-ring`, transition `duration-fast`.
- Placeholder in `ink-faint`. Background `bg-100`.
