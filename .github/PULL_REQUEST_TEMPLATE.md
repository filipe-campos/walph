## Summary

<!-- One or two sentences: what this pull request does and why. Link the related issue, e.g. "Closes #123". -->

## Changes

<!-- The main changes, as a short list. -->

-

## How it was tested

<!-- Describe how you verified the change. Screenshots or a short recording help a lot for UI changes. -->

- [ ] Unit tests (Vitest) added or updated
- [ ] E2E tests (Playwright) added or updated
- [ ] Verified manually in the running app (`pnpm dev`) on: <!-- macOS / Windows / Linux -->

## Checklist

- [ ] `pnpm check` is green with zero warnings
- [ ] `pnpm test:e2e` passes (when the change touches behavior covered by E2E)
- [ ] Commits follow the `type(scope): summary` convention from [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] User-visible strings come from the i18n catalogs, in pt-BR, English and Spanish
- [ ] The [security baseline](../CONTRIBUTING.md#security-baseline) is respected (sandbox, no `shell: true`, writes through `atomicWrite`, etc.)
- [ ] Docs updated if needed (README, `docs/`, `CLAUDE.md` or `.claude/skills/` when the architecture changed)
