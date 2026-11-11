# Switch

On/off toggle for preferences that apply immediately, without a save button.

**The consumer provides:** `checked`, `onChange(checked)`, `label` (becomes `aria-label`; required when there is no visible label) and `disabled`. In Settings, use it inside a `SettingRow`, which provides the visible label.

- Off: `bg-400` track with a `line-strong` outline (3:1) and an `ink-muted` knob. On: `--grad-brand` track with `accent-glow` glow and an `on-accent` knob.
- The knob slides 14px in `duration-fast` + `ease-out` and stretches 2px on press.
- For a choice among three or more options, use `Select`.
