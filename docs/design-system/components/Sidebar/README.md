# Sidebar

The left sidebar of each workspace, as in VS Code: a 48px **vertical icon column** (**Explorador**, **Pesquisar**, **Controle de código** and **Containers** at the top, **Configurações** at the bottom) and, next to it, the active view with title, actions and content.

**The consumer provides:** `activeView` and `onSelectView`; optional `views` (default: `files` Explorador ⇧⌘E, `search` Pesquisar ⇧⌘F, `branch` Controle de código ⌃⇧G), each with an optional `badge`; `onSettings` (shows the gear, ⌘,); `collapsed` and `onToggleCollapse`; `title` to change the title (e.g. "Explorador · billing-api"); `actions` (`wp-x` buttons in the header); and `children`, the view content (`TreeItem`s, search `Input`, list of changes). The bar is controlled and keeps no state.

**Icon column**

- 48px wide (36px buttons), background `bg-000` (the same as `WorkspaceBar`, forming a dark "L" with it), `line` hairline on the right.
- 20px icons in `ink-muted`; hover in `bg-300`. The active one gets a `bg-300` background, an `accent` icon with the duotone fill and a 2px vertical indicator in an `accent` → `accent-2` gradient on the left edge, which grows in `duration-fast`.
- `badge` becomes a `--grad-brand` counter in the icon corner (pending git changes), with a `bg-000` ring; it enters with the `duration-base` pop.
- The gear always sits at the bottom of the column, separate from the views.

**Views that take over the screen (`takeover`)**

- **Containers** (`box` icon, ⇧⌘D) has `takeover: true`: when activated, the `Sidebar` hides the panel and only the column remains; the consumer replaces everything on the right with `ContainersView`. The indicator and the icon background stay lit to remind you where you are; clicking any other view returns to the normal workspace layout.
- The Containers `badge` counts containers with problems (unhealthy or restarting).

**Behavior**

- Clicking the already active icon collapses the view and leaves only the column (the indicator shrinks by half); clicking again, or on another view, expands it.
- Switching views: the content slides in 4px from the left in `duration-base` + `ease-out`. The icon shrinks to 0.9 on press.
- Keyboard: the column is a vertical `tablist` with roving focus; ↑ ↓, Home and End switch views. Each view's name and shortcut are in the tooltip.
- View title in `caption` (uppercase, `ink-muted`); actions always visible on the right.
