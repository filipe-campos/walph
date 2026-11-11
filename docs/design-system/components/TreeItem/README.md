# TreeItem

File explorer row: folder or file, with indentation, selection and git status.

**The consumer provides:** `label`, `kind`, `depth` (12px per level), `open`, `selected`, `git` (`M`, `A`, `D`) and `onClick`; the container has `role="tree"`.

- The chevron rotates 90° when opening (`duration-fast`).
- The 16px icon comes from `FileIcon` by `label`: files by extension or name, folders by category (and the open shape when `open`). Pass `icon` (an `IconName`) to force another one.
- Selected: `accent-soft` background. Hover: `bg-400`.
- Git: `M` in `warning`, `A` in `success`, `D` in `danger`; the letter always shows, not just the color.
- Ignored by git (`.gitignore`): name in `ink-faint` and icon at 55% opacity (selection and focus intact), with no letter or badge; this applies to the item or any ancestor (`node_modules/` dims the whole tree). A real git decoration (`M`, `A`, `D`…) takes precedence.
