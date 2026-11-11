# ClaudePanel

The Claude Code side panel inside a workspace: several sessions in tabs, each with its own conversation, tool calls, permission requests and final summary with diff.

**The consumer provides:** `workspace`, `commands` (`name`, `description`, `argumentHint`, `scope: 'project' | 'user'`, read from `.claude/commands`), `question`, `status` (`AgentStatus`), `messages` (`role: 'user' | 'assistant' | 'tool'`; tools with `name`, `target`, `state`, `add`/`del`), `permission` (`command`, `onAllow`, `onAllowAlways`, `onDeny`) when the agent asks for something, `summary` (`title`, `files`, `onReview`) when it finishes, `onSubmit(text)` and `onStop`.

**Top bar (a single one)**

- To the right of the tabs: **+** new session, **star** to favorite the active session (`onToggleFavorite`; favorite sessions show an `accent` star before the title, and the star bounces with a pop when turned on) and **⋯** with the session menu: Renomear (F2), Duplicar, Exportar conversa (.md), Compactar contexto and, separated in `danger`, Fechar sessão (⌘W). Swap the items with `sessionActions` and handle them in `onSessionAction(action, sessionId)`.

- From left to right: the Claude Code mark (the `brain` icon, an AI brain, in gradient in a 28px square, 12% `accent` background), the session tabs and the "+" for a new session. No title, no workspace chip and no status text: the status lives in each tab's dot, and the workspace is already in the `WorkspaceBar` (it stays in the mark's `aria-label` and tooltip).
- While the active session runs, the mark gets a soft `accent-glow` halo.
- Without `sessions`, the bar shows the mark, the dot and the status as text (single session).

**Sessions (tabs)**

- Pass `sessions` (`id`, `title`, `status`, `unread`), `activeSessionId`, `onSelectSession`, `onNewSession` and `onCloseSession`. `status`, `messages`, `permission` and `summary` are always those of the active session: the panel does not keep conversations; it does keep the field draft, per session.
- Each session runs in parallel, with its own context. Name it after the task ("Pix no checkout"); a new one starts as "Sessão N" and can be renamed after the first message.
- The tab shows the status dot (pulse while running, ping when it finishes or asks for something). An inactive session that finishes or asks for permission gets a counter (the background does not change); on opening, reset `unread`.
- With many sessions, inactive tabs shrink down to 72px (title with ellipsis) before the strip scrolls; the active one keeps its size and scrolls into view.
- The active tab has a `bg-300` background and a 2px `--grad-brand` stroke **at the top** that grows in `duration-fast` (same as the editor's active tab). If the active session is `running`, the stroke becomes a neon rail: a 28% `accent` base line with an `accent-2` → `accent` → `accent-3` comet running from left to right along the top of the tab (one pass every ~1.75s, `ease-linear`, continuous) and an `accent-glow` glow. Inactive tabs that are running keep only the pulsing dot. With `prefers-reduced-motion`, the stroke stays still in `--grad-ai`. New tabs enter rising 4px. The "x" appears on hover and on the active tab.
- A new, empty session shows an initial state with the `brain` icon.
- Shortcuts: `⇧⌘L` new session · `⌃Tab` / `⌃⇧Tab` switches · `⌘W` (with focus on the panel) closes.
- **Workspace status** (`WorkspaceTab`) = the most urgent among the sessions: `attention` > `error` > `running` > `done` > `idle`; `unread` = the sum over the sessions. The `Toast` names the session in the description ("Pix no checkout · 3 arquivos alterados").
- `permission` present ⇒ status `attention`. The card has a `warning` outline and three actions: Permitir (primary), Sempre neste workspace, Negar.
- While `running`, the **Pensando** indicator appears: the Walph symbol (the two Vs) as a dimmed outline, with two comets of light running along each V (`accent-3` on the front one, `accent` on the back one, in opposite directions and half a turn out of phase) every `duration-pulse`, `ease-linear`, with an `accent-glow` glow. Next to it, the word "Pensando" in `ink-muted` with an `accent-3` → `accent` band of light sweeping across at the same pace. With `prefers-reduced-motion`, the symbol has its whole outline lit and the text stays still. The send button becomes "Parar".
- Each new message enters rising 4px in `duration-base` + `ease-out`; the panel scrolls smoothly to the end.
- Diff in mono: `+N` in `success`, `−N` in `danger`, always signed.

**Claude's actions (tools)**

- Each tool call is a row with an icon that says what was done and the verb in Portuguese: `eye` **Leu** (Read) · `filePlus` **Criou** (Write) · `pencil` **Editou** (Edit/MultiEdit) · `terminal` **Bash** · `search` **Buscou** (Grep) · `folder` **Listou** (Glob) · `globe` **Abriu/Pesquisou** (WebFetch/WebSearch) · `agent` **Agente** (Task) · `plan` **Tarefas** (TodoWrite) · `question` **Perguntou** (AskUserQuestion). An unknown tool uses `bolt` and its own name; `label` and `icon` override.
- The icon square shows the state: done in `success` on a tinted background, running in `accent` while the neon line travels around the card's border (`.wp-neon-live`), failed in `danger`.
- With `detail` (lines `{ text, kind }`, `kind` = `cmd` · `ok` · `err` · `muted` · `add` · `del` · `ctx` · `q` · `a`) or `output`, the row becomes a button with a chevron: clicking expands what happened (the Bash command and output, the excerpt read, the edit diff with green `+` and coral `−` lines, the question and the answer). The expanded area scrolls beyond 220px. `meta` shows a short value on the right ("142 linhas", "4,2 s").
- In the final summary, changed files use the file theme icon (`FileIcon`).
- User messages on the right in `bg-400`; Claude's, running text without a bubble.

**Your last message pinned at the top**

- While the answer scrolls, the last message you sent stays pinned at the top of the panel (up to 3 lines, with ellipsis), over a `bg-200` gradient that fades whatever passes underneath. Clicking it scrolls to the message.
- When you scroll up and reach it, it unpins and moves down again with the rest of the conversation; earlier messages scroll normally. Only the last message stays pinned.

**Claude's questions**

- `question` (`questions`, `onSubmit`, `onSkip`) shows `ClaudeQuestion` at the end of the conversation, in place of the "Pensando" indicator. The session stays `attention` until you answer. See the `ClaudeQuestion` component.

**Agents at work**

- `agents` (`name`, `task`, `status`, `elapsed`) appears in a collapsible strip right above the field: "Agentes · 2 trabalhando · 1 concluído". Each row has the status dot, the agent name in mono, the task and the time.
- A running agent gets a 1px neon stroke running along the bottom of the row; a finished one has its task dimmed. Below 340px of panel width, only name and time.

**Message field and toolbar**

**Favorite commands**

- A strip of icons right above the field. Each icon is a command from `.claude/commands` that you pinned: one click **runs the command directly** (`onRunCommand(name, sessionId)`; without it, sends `/name` through `onSubmit`). The tooltip shows `/name` followed by the description; on hover an "x" appears to remove it from favorites.
- The (dashed) **+** opens a two-step panel: **1 · Command** (list of commands that are not favorites yet) and **2 · Ícone** (grid of 24 icons), with the preview and the Adicionar button. Esc or clicking outside closes it.
- Icons in `accent` on `bg-200`; on hover, `accent-soft` background with outline and `accent-glow` glow; pressed shrinks to 0.94.
- Pass `favoriteCommands` (`{ name, icon }`) and `onFavoriteCommandsChange` to store the list (without them the panel stores it on its own; `showFavorites` shows the empty strip with the hint "Fixe commands aqui").

From left to right, below the text:

- **Attach** (paperclip, `onUpload`): opens the file picker; dragging files onto the field also works (dashed `accent` outline while dragging). Attachments become chips with name, size and "x" above the text.
- **Commands** (`/` icon, `commands`): lists the project's commands from `.claude/commands` and, separately, the personal ones from `~/.claude/commands`, with the name in mono, the expected argument and the description. Typing `/` in the empty field opens the same list. Choosing one writes `/name ` in the field and calls `onCommand(name)`. An empty list shows how to create a command.
- **Execution mode** (chip with icon, `mode`): Manual (hand) · Edit automatically (pencil, `accent`) · Plan (list, `accent-3`) · Auto (lightning bolt in gradient) · Bypass permissions (shield, `danger`). The menu shows each one's description; ⇧Tab in the field cycles through them. In Plan the note "o Claude só lê e propõe" appears; in Bypass the chip turns coral, so does the field border, and a note warns that commands run without asking.
- **Model and effort** (chip "Opus ▁▃▅▇█ high"): the menu lists the models (`models`) and, below, the effort slider matching Claude Code's `/effort`: `low` · `medium` · `high` · `xhigh` · `max`, with the names in English and mono, as in the terminal, plus the `auto` button (the model's default, shown beside it: "auto · high"). The track fills in `--grad-ai` up to the chosen level; the current dot grows with an `accent` halo; in `auto`, the dot is hollow and the track at half light. The ← → arrows move the level. A note explains the level (`max` applies only to the current session). Levels the model does not accept (`efforts`) are disabled. On the chip, five rising bars show the level and the name sits next to them; the default is `auto`.
- **Speak** (microphone, `listening`/`onSpeakChange`): when on, the button turns `accent-soft` with a glow and four pulsing wave bars; the placeholder becomes "Ouvindo… fale sua instrução". Speech recognition is up to the consumer.
- **Send** (`--grad-brand`) or **Stop** (square, while `running`).

Menus in the field bar (commands, mode, model) open upward and span the field's width (they are never clipped by the panel edge), enter rising 4px in `duration-base` and close with Esc or a click outside, returning focus to the button.
- **Light:** top bar with an `accent` halo in the left corner, behind the mark. While the **active** session is `running`, the neon line travels around the message field border (background sessions show only the pulsing dot, so there are never more than three traces); when idle, the border goes back to `line-strong`. With focus on the field there is no purple ring: the border only lightens to `ink-faint` (the cursor already marks where you are). The final summary has a static gradient border and `shadow-neon`. The send button uses `--grad-brand`.
