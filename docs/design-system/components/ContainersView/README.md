# ContainersView

The Docker Containers screen. It opens from the **Containers** icon (box) in the `Sidebar` column and **replaces everything to the right of the column** (explorer, editor, terminal and Claude panel) until you pick another view.

**The consumer provides:** `projects` (one group per compose project: `id`, `name`, compose `path` and `containers`), `logs` (per container id: `time`, `text`, `level` = `info` · `warn` · `error` · `debug`), Docker `context` and `version`, the machine's `memUsed`/`memTotal`/`memPct`, `selectedId`/`onSelect`, `onAction(action, id)` (`start`, `stop`, `restart`, `exec`, `open-port`), `onGroupAction(action, projectId)` (`up`, `restart`, `stop`), `onComposeUp`, `onRefresh` and `onAskClaude(id)`. Each container: `id`, `name`, `image`, `status` (`running` · `restarting` · `unhealthy` · `exited` · `paused` · `created`), `uptime`, `cpu` (%), `cpuHistory` (short series for the sparkline), `mem`, `memPct`, `ports` (`host`, `container`, `web` to become a link) and, for the details, `command`, `created`, `network`, `mounts`, `envCount`, `healthNote`.

**Layout**

- **Header**: icon, "Containers", the Docker context (`desktop-linux · v27.3`) with an engine dot; on the right, search (name, image or port), a Todos / Rodando / Parados filter with counts, refresh and **Compose up** (primary).
- **Summary** in four cards: Rodando (x de y), Com problema (turns coral when > 0), CPU total with a bar, Memória usada / total. They enter in sequence with `duration-stagger`.
- **List grouped by compose project**: each project is its own **card** (`bg-100`, `line` outline, `radius-lg`; coral outline if any container has a problem). The card header has a status stroke on the left edge (teal all running, teal→gray gradient partial, amber restarting, coral with a problem, gray stopped), chevron, the compose icon, name in 600 with "N containers", the compose path in mono below, per-state summary chips (`● 2 rodando` `● 1 com problema` `● 1 reiniciando` `○ 1 parado`) and, separated by a divider, the group actions: up, restart, stop. The rows sit inside the card, separated by hairlines.
- **Row**: status dot, name in mono + short id · image:tag · ports as chips (`3000→3000`; web ports get ↗ and open `localhost`) · CPU with number and sparkline · memory with number and bar (amber above 85%) · status pill + uptime · actions (logs, terminal in the container, restart, stop/start), which light up on hover. Stopped ones have dimmed text.

**Status**

| status | dot | pill |
| --- | --- | --- |
| `running` | `success` with halo | Rodando |
| `restarting` | `warning` pulsing | Reiniciando |
| `unhealthy` | `danger` with halo | Unhealthy |
| `exited` / `created` | empty `ink-faint` ring | Parado / Criado |
| `paused` | solid `ink-faint` | Pausado |

**Details panel** (click a row): slides in 12px from the right. Shows name and image, actions (Terminal, Reiniciar, Parar/Iniciar) and the tabs **Logs** (mono font, dimmed time, `warn` in yellow, `error` in red, `debug` dimmed) and **Detalhes** (id, image, command, created, network, volumes, ports, variables). An `unhealthy` container or one restarting in a loop gets a card with a coral border explaining the problem and the **Investigar com o Claude** button, which opens a session in `ClaudePanel` with the logs as context.

**Responsive** (container queries on the screen itself): below 1180px the Imagem column disappears; below 920px CPU and Memória disappear, the summary becomes 2×2 and the details float over the list; below 640px the ports disappear.
