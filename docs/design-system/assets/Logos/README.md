# Logos

The Walph symbol is two overlapping Vs that form a W: the front one (`accent-3` → `accent`) passes over the back one (`accent` → `accent-2`), separated by a thin gap. Two workspaces side by side in a single window. The wordmark is "walph" in Geist SemiBold, lowercase, with −2% letter spacing, converted to outlines.

| file | when |
| --- | --- |
| `walph-logo.svg` | default: gradient symbol + wordmark in `ink`, on dark backgrounds |
| `walph-logo-mono.svg` | everything in `ink` (one-color print, video, over images) |
| `walph-logo-dark.svg` | gradient symbol + wordmark in `bg-000`, on light backgrounds |
| `walph-symbol.svg` | symbol only: avatar, favicon, title bar, square spaces |
| `walph-symbol-mono.svg` · `walph-symbol-dark.svg` | one-color symbol, light and dark |

- Clear space: half the symbol's height all around.
- Minimum size: full logo at 20px tall; symbol at 16px.
- Do not recolor the gradient, rotate it, separate the two Vs, add an outline or shadow, or use the wordmark without the symbol.
- In React code, prefer `Walph.Logo` (`variant="full" | "symbol"`, `tone="color" | "mono" | "dark"`, `size` = height in px).
