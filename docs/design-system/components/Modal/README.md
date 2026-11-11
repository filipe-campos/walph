# Modal

Modal window over the IDE: Settings (⌘, or the `Sidebar` gear), destructive confirmations and any short flow that needs full attention.

**The consumer provides:** `title`, `description`, `icon`, `children` and `onClose` (called **after** the exit animation; unmount there). Optional footer: `footer` (note on the left), `primaryLabel`/`onPrimary`, `secondaryLabel`/`onSecondary`. For Settings, `nav` (`id`, `label`, `icon`), `activeNav` and `onNav` create the section menu on the left. Form pieces: `SettingRow` (label + description on the left, control on the right), `Switch` and `Select`; group titles with `<div class="wp-setting-group">`.

**Sizes:** `sm` 420px (confirmations) · `md` 560px (default) · `lg` 800×560 (default when there is `nav`).

**Tones**

- `default`: static gradient border (`.wp-neon`), `accent` halo in the header corner, icon in a 32px square.
- `danger`: `role="alertdialog"`, icon and halo in `danger`, border with a coral touch, primary button `variant="danger"`. Title as a question ("Fechar billing-api?"), description with the consequence, button with the action verb ("Fechar e interromper"), never "OK".

**Motion**

- Enter: the backdrop darkens and blurs 6px in `duration-fast`; the panel rises 8px and scales from 0.97 in `duration-base` + `ease-out`.
- Exit: `duration-fast` + `ease-in`, drops 4px and fades out. Switching section in the menu: the content slides in 4px.
- Active menu item: `bg-300` background, `accent` icon and a vertical gradient stroke on the left (`duration-fast`). Switch on: `--grad-brand` track with glow; the knob slides in `duration-fast` and stretches on press.

**Accessibility**

- `aria-modal`, title and description linked through `aria-labelledby`/`describedby`.
- On open, focus goes to the first control in the body (or to the element with `data-autofocus`); in `danger`, it goes to the safe button (Cancelar), never to the destructive action; Tab is trapped inside the modal; on close, focus returns to whatever opened it.
- Esc, the "x" and clicking outside close it, except with `dismissible={false}`, for mandatory choices.
- At most one modal at a time; do not open a modal from a modal. Claude notices are never modals: use `Toast` and the status on the tab.
