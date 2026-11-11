# FileIcon

Walph's file and folder icon theme: each file gets a color and symbol by its type, and each folder by the role its name indicates (`src`, `components`, `migrations`, `.github`, `node_modules`…). There are more than 430 file names, extensions and suffixes and 71 folder categories (with more than 400 names), all drawn in the Walph style.

**The consumer provides:** `name` (name or path; only the last segment counts), `kind` (`'file'` default · `'folder'`), `open` (open folder), `size` (default 16) and `title` (becomes the accessible name; without it the icon is decorative). `TreeItem`, `EditorTab` and the `ClaudePanel` attachments already use `FileIcon` by name. `Walph.fileIconFor(name, { folder, open })` returns what was chosen, and `Walph.fileIcons` exposes the tables for extending.

**How a file is resolved** (the first match wins):

1. Exact name: `package.json`, `Dockerfile`, `docker-compose.yml`, `CLAUDE.md`, `.env*`, `tsconfig.*.json`, `README*`, `LICENSE*`, Vite, ESLint, Prettier, Jest, Tailwind, Nest, Prisma configs…
2. Compound suffix: `.d.ts`, `.test.ts`/`.spec.ts`, `.stories.tsx`, `.module.css` and the Nest roles: `.controller.ts`, `.service.ts`, `.module.ts`, `.entity.ts`, `.dto.ts`, `.guard.ts`, `.middleware.ts`, `.resolver.ts`, `.repository.ts`…
3. Extension: languages, data, configuration, media, fonts, archives, keys and certificates.
4. No match: generic sheet in `gray`.

**Drawing**

- **Languages** become a 13px label with 3px corners, in the language color, with the abbreviation in dark Geist 700: `TS`, `TSX`, `JS`, `PY`, `GO`, `RS`, `C#`, `PHP`… Up to three letters.
- **Everything else** is a duotone glyph (1.35 stroke and 20% fill) in the type color: `{ }` JSON, `#` CSS, `< / >` HTML, SQL cylinder, prism, GraphQL graph, padlock for lockfiles, key for `.env`, flask for tests, book for README, scale for LICENSE, brain for `CLAUDE.md`…
- **Folders** are solid in the category color (back at 62%, full front) and take up almost the whole 16px box; the category glyph, cut out in dark, covers the bottom right corner (about 2/3 of the icon) so it reads at tree size. In the explorer, folders appear at 18px, slightly larger than files, as in VS Code icon themes. When open, the front tilts. Folder without a category: `slate`, no glyph.
- Own palette of 17 light tones (`FI_COLORS` in `Walph.fileIcons.colors`), all above 3:1 on `bg-200`. They are type colors, not state colors: do not use them for status.
- Do not use brand logos: abbreviations and generic glyphs keep the theme consistent and free of third-party marks.
