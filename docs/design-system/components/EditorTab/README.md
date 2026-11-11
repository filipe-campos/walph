# EditorTab

A file tab inside a workspace; use `EditorTabs` for the whole strip above the editor (scrolling tabs + actions on the right).

**The consumer provides:** for `EditorTabs`, `tabs` (`id`, `name`, `dirty`), `activeId`, `onSelect(id)`, `onClose(id)` and the actions `onSplit` (with `split` for the on state) and `onPreview` (with `previewOpen`). For a standalone tab, `EditorTab` with `name`, `active`, `dirty`, `onSelect`, `onClose`.

- Strip in `bg-200`, **no bottom line**: the active tab in `bg-100` merges with the editor.
- Tabs with top corners in `radius-md` (the same radius as `WorkspaceTab`), 2px between them and no dividers. Hover: `bg-300`.
- The active tab has a 2px `--grad-brand` stroke on top (the same gradient as the `ClaudePanel` session tab), which grows from the center in `duration-fast` + `ease-out`.
- The tab icon comes from `FileIcon` by file name.
- `dirty` shows an `ink-muted` dot that turns into an "x" on hover.
- **On the right:** Markdown preview (`markdown` icon, ⇧⌘V), shown only when the active file is `.md`/`.mdx` (or with `canPreview`), and split editor (`split` icon, ⌘\). When on, the button becomes `accent-soft` with an `accent` icon. Extra actions go through `actions` (use the `wp-x` class).
- Many tabs: the strip scrolls horizontally without a scrollbar; the actions stay fixed.
