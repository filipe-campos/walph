# Security Policy

## Supported versions

Only the latest minor release receives security fixes. Fixes ship as a new patch release, delivered through the
built-in auto update.

| Version        | Supported |
| -------------- | --------- |
| Latest minor   | Yes       |
| Older releases | No        |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, discussions or pull requests.**

Report it privately through one of these channels:

- **GitHub Security Advisories (preferred):** open the
  [Security tab](https://github.com/filipe-campos/walph/security) of the repository and click
  **Report a vulnerability**.
- **Email:** [filipefcl@hotmail.com](mailto:filipefcl@hotmail.com), with `[Walph security]` in the subject.

Please include:

- The Walph version, operating system and architecture.
- A description of the issue and its impact.
- Steps to reproduce or a proof of concept (a sample repository, file or command is ideal).
- Any suggested fix or mitigation, if you have one.

## What to expect

- **Acknowledgement** within 3 business days.
- **Initial assessment** (confirmed or not, severity) within 7 days.
- **Fix** for confirmed issues as soon as possible, usually within 30 days depending on complexity. You will be kept
  informed of the progress.
- Once a fix is released, the advisory is published and you are credited, unless you prefer to remain anonymous.

Walph is maintained by a single person, so please be patient. Coordinated disclosure is appreciated: give us a
reasonable chance to release a fix before going public.

## Scope

Walph opens arbitrary folders and repositories and runs external tools on them, so the most relevant areas are:

- **Electron sandbox and isolation.** Every web contents runs with `contextIsolation`, `sandbox` and without
  `nodeIntegration`. Anything that lets renderer content escape the sandbox, reach Node or Electron APIs directly, load
  remote content in the app window or bypass the Content Security Policy is in scope.
- **IPC between renderer and main.** The preload exposes a typed API through `contextBridge`. Handlers that can be
  abused to read, write or delete files outside what they should (for example explorer operations escaping the
  workspace folder), to run arbitrary commands or to inject arguments into `git`, `rg`, `docker` or language servers are
  in scope.
- **Claude Code panel.** Conversations run through the Claude Agent SDK with an explicit permission mode. Bypasses of
  the permission prompts (a tool running without the approval the selected mode requires), leaks of MCP server secrets
  (env values, headers) to the renderer, or prompt content from a repository that triggers actions without the user's
  consent are in scope.
- **Untrusted output.** Language server, docker and git output rendered in the UI (for example Markdown hovers) that
  leads to script execution.
- **Auto update and the `walph` launcher.** Anything that allows installing an update not published in the official
  GitHub Releases, or hijacking the installed command.

Out of scope:

- Vulnerabilities in Claude Code itself, the Claude models or the Anthropic API (report them to Anthropic).
- Actions the user explicitly approved in the Claude panel, or that run in a permission mode the user chose that skips
  approvals.
- Code executed by tools the user runs on purpose (terminal commands, tasks, language servers or MCP servers the user
  configured).
- Issues that require an already compromised machine or physical access.
- Unsigned builds produced locally with `pnpm dist`.
