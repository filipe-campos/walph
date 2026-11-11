# Aplicativo

Desktop application icons. Flat dark background, with no halo or shadow behind the symbol, a 7% sheen at the top and a thin `accent-3` → `line` → `accent` ring on the edge: the same light as the interface's neon line.

| file | use |
| --- | --- |
| `walph-app-macos.svg` · `walph-app-macos-1024.png` | macOS: 824px squircle on a 1024 canvas (Apple's grid), with shadow. Generate the `.icns` from it (16–1024, with @2x). |
| `walph-app-macos-small.svg` | macOS at 16 and 32px: larger symbol and thicker ring so it stays legible |
| `walph-app-windows.svg` · `walph-app-windows-256.png` | Windows and Linux from 48px up: square with 18% corners, no margin |
| `walph-app-small.svg` | Windows and Linux from 16 to 40px |

The ready-made packages (`walph.icns`, `walph.ico` with 16–256px and the Linux PNGs at 16–512px in the `hicolor` structure) live outside the design system, next to the app code.
