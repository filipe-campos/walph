import type * as React from 'react';

/** Claude Code state in a workspace. */
export type AgentStatus = 'idle' | 'running' | 'done' | 'attention' | 'error';

export interface Workspace {
  id: string;
  name: string;
  /** Current branch, shown in mono below the name. */
  branch?: string;
  /** Path on disk, used as the tooltip. */
  path?: string;
  status?: AgentStatus;
  /** Unread notifications (e.g. Claude Code finished while you were in another workspace). */
  unread?: number;
}

export interface WorkspaceBarProps {
  workspaces: Workspace[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onClose?: (id: string) => void;
  /** Shows the "+" button to open another workspace. */
  onAdd?: () => void;
  className?: string;
}
export declare function WorkspaceBar(props: WorkspaceBarProps): React.ReactElement;

export interface WorkspaceTabProps extends Workspace {
  active?: boolean;
  /** Displayed shortcut (WorkspaceBar fills in ⌘1…⌘9). */
  shortcut?: string;
  onSelect?: () => void;
  onClose?: () => void;
  className?: string;
}
export declare function WorkspaceTab(props: WorkspaceTabProps): React.ReactElement;

export interface ToastProps {
  tone?: 'done' | 'attention' | 'error' | 'info';
  title: React.ReactNode;
  /** Source workspace: shown in a card above the toast. */
  workspace?: string;
  /** Workspace branch, in the source card. */
  branch?: string;
  /** Full path, in the source card tooltip. */
  workspacePath?: string;
  description?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  /** Auto-dismiss in ms (paused on hover). Omit for toasts that require an action. */
  duration?: number;
  /** Called when the exit animation ends. */
  onDismiss?: () => void;
  className?: string;
}
export declare function Toast(props: ToastProps): React.ReactElement;

export type IconName = 'close' | 'plus' | 'chevron' | 'check' | 'alert' | 'error' | 'spark' | 'file' | 'folder' | 'search' | 'branch' | 'terminal' | 'send' | 'command' | 'diff' | 'agent' | 'layers' | 'files' | 'gear' | 'clip' | 'more' | 'mic' | 'star' | 'hand' | 'pencil' | 'plan' | 'bolt' | 'shield' | 'stop' | 'box' | 'play' | 'restart' | 'logs' | 'external' | 'split' | 'markdown' | 'slash' | 'question' | 'commit' | 'arrowUp' | 'arrowDown' | 'brain' | 'eye' | 'globe' | 'filePlus' | 'rocket' | 'flask' | 'bug' | 'book' | 'database';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 'danger' only for the destructive action of a Modal tone="danger". */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: IconName;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: IconName;
  /** Shortcut shown on the right, e.g. "⌘P". */
  shortcut?: string;
}
export declare function Input(props: InputProps): React.ReactElement;

export interface EditorTabProps {
  name: string;
  active?: boolean;
  /** File with unsaved changes: shows a dot instead of the "x". */
  dirty?: boolean;
  onSelect?: () => void;
  onClose?: () => void;
  className?: string;
}
export declare function EditorTab(props: EditorTabProps): React.ReactElement;

export interface EditorTabsProps {
  tabs: { id: string; name: string; dirty?: boolean }[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onClose?: (id: string) => void;
  /** Shows the "Dividir editor" button (⌘\). */
  onSplit?: () => void;
  /** Split editor: the button stays on. */
  split?: boolean;
  /** Shows the Markdown preview button when the active file is .md/.mdx (or with canPreview). */
  onPreview?: () => void;
  previewOpen?: boolean;
  canPreview?: boolean;
  /** Extra buttons on the right (class "wp-x"). */
  actions?: React.ReactNode;
  className?: string;
}
/** The editor tab strip: scrolling tabs plus split editor and Markdown preview on the right. */
export declare function EditorTabs(props: EditorTabsProps): React.ReactElement;

export interface TreeItemProps {
  label: string;
  kind?: 'file' | 'folder';
  depth?: number;
  open?: boolean;
  selected?: boolean;
  /** Git status: Modified, Added, Deleted. */
  git?: 'M' | 'A' | 'D';
  /** Forces a Walph.Icons icon instead of the automatic FileIcon. */
  icon?: IconName;
  onClick?: () => void;
  className?: string;
}
export declare function TreeItem(props: TreeItemProps): React.ReactElement;

export interface PaletteItem {
  id: string;
  label: string;
  /** Grouping: "Workspaces", "Comandos", "Arquivos". */
  group?: string;
  /** Secondary text in mono (branch, path). */
  hint?: string;
  icon?: IconName;
  /** For workspaces: shows the status dot instead of the icon. */
  status?: AgentStatus;
  shortcut?: string;
}
export interface CommandPaletteProps {
  items: PaletteItem[];
  defaultQuery?: string;
  placeholder?: string;
  onSelect?: (item: PaletteItem) => void;
  /** Enables the "Perguntar ao Claude" row with the search text. */
  onAskClaude?: (query: string) => void;
  /** Called when the exit animation ends: unmount the palette here. */
  onClose?: () => void;
  /** Renders in the flow instead of as a fixed overlay. */
  inline?: boolean;
  className?: string;
}
export declare function CommandPalette(props: CommandPaletteProps): React.ReactElement;

export interface TerminalTab { id: string; name: string; kind?: 'shell' | 'claude'; status?: AgentStatus }
export interface TerminalLine { kind?: 'input' | 'output' | 'muted' | 'info' | 'success' | 'warning' | 'error'; text: string }
export interface TerminalProps {
  tabs: TerminalTab[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onAdd?: () => void;
  cwd?: string;
  branch?: string;
  lines?: TerminalLine[];
  /** Text already typed on the prompt line. */
  draft?: string;
  /** false hides the prompt line. */
  prompt?: boolean;
  className?: string;
}
export declare function Terminal(props: TerminalProps): React.ReactElement;

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'tool';
  text?: string;
  /** Tool (role 'tool'): Read, Write, Edit, Bash… */
  name?: string;
  target?: string;
  state?: 'running' | 'done' | 'error';
  add?: number;
  del?: number;
  /** Short text on the right: "142 linhas", "4,2 s". */
  meta?: string;
  /** Overrides the tool's default verb and icon. */
  label?: string;
  icon?: IconName;
  /** What happened, shown when the row is expanded. */
  detail?: (string | { text: string; kind?: 'cmd' | 'ok' | 'err' | 'muted' | 'add' | 'del' | 'ctx' | 'q' | 'a' })[];
  /** Alternative to detail: free text (split by line). */
  output?: string;
  /** Starts expanded. */
  expanded?: boolean;
}
/** A Claude Code session inside the workspace (a tab in the panel). */
export interface ClaudeSession {
  id: string;
  /** Short task name: "Pix no checkout", "Testes E2E". */
  title: string;
  status?: AgentStatus;
  /** Updates since the tab was last seen (finished, asked for something). */
  unread?: number;
  /** Favorited session: star on the tab. */
  favorite?: boolean;
}
/** Claude Code execution mode (⇧Tab cycles). */
export type ClaudeMode = 'manual' | 'edit' | 'plan' | 'auto' | 'bypass';
/** The Claude Code /effort levels; 'auto' = the model default. */
export type ClaudeEffort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
/** Subagent working inside the active session. */
export interface ClaudeAgent { id: string; name: string; task: string; status?: AgentStatus; elapsed?: string }
export interface ClaudeAttachment { id: string; name: string; size?: string }
/** A question from Claude (AskUserQuestion). */
export interface ClaudeQuestionItem {
  id?: string;
  /** Short tab label when there are several questions: "ORM", "Testes". */
  header?: string;
  question: string;
  options: { label: string; description?: string }[];
  multiSelect?: boolean;
}
export interface ClaudeQuestionProps {
  questions: ClaudeQuestionItem[];
  /** Answers by id (or header): the chosen labels; "Outro" becomes the typed text. */
  onSubmit?: (answers: Record<string, string[]>) => void;
  /** The "x": skip and let Claude decide. */
  onSkip?: () => void;
  className?: string;
}
export declare function ClaudeQuestion(props: ClaudeQuestionProps): React.ReactElement | null;

/** Command from .claude/commands (project) or ~/.claude/commands (personal). */
export interface ClaudeCommand { name: string; description?: string; argumentHint?: string; scope?: 'project' | 'user' }

export interface ClaudePanelProps {
  /** Only in the brand aria-label and tooltip: the workspace name already appears in the WorkspaceBar. */
  workspace?: string;
  /** Session tabs, in the top bar next to the Claude brand. Omitted = single session (brand + text status). */
  sessions?: ClaudeSession[];
  activeSessionId?: string;
  onSelectSession?: (id: string) => void;
  /** Shows the "+" (⇧⌘L) to open a new parallel session. */
  onNewSession?: () => void;
  onCloseSession?: (id: string) => void;
  /** Commands of the "/" button (and of typing "/" in the empty field). Omitted = no button; [] shows how to create one. */
  commands?: ClaudeCommand[];
  /** Picking a command writes "/name " in the field and calls this. */
  onCommand?: (name: string) => void;
  /** Favorite commands (icons above the field). Controlled or uncontrolled. */
  favoriteCommands?: { name: string; icon: IconName }[];
  onFavoriteCommandsChange?: (favorites: { name: string; icon: IconName }[]) => void;
  /** Clicking a favorite runs the command. Without it, sends "/name" through onSubmit. */
  onRunCommand?: (name: string, sessionId?: string) => void;
  /** Shows the favorites strip even when empty. */
  showFavorites?: boolean;
  /** Pending question from Claude (status must be 'attention'). */
  question?: ClaudeQuestionProps | null;
  /** Status, messages, permission and summary always belong to the active session. The last user message stays pinned at the top while the reply scrolls. */
  status?: AgentStatus;
  messages?: ClaudeMessage[];
  /** Pending permission request (status must be 'attention'). */
  permission?: { command: string; onAllow?: () => void; onAllowAlways?: () => void; onDeny?: () => void } | null;
  /** Summary when it finishes. */
  summary?: { title?: string; files?: { path: string; add: number; del: number }[]; onReview?: () => void } | null;
  /** Also receives the active session id. The field draft is kept per session. */
  onSubmit?: (text: string, sessionId?: string) => void;
  onStop?: () => void;
  /** Header star: favorites/unfavorites the active session. */
  onToggleFavorite?: (sessionId: string) => void;
  /** Items of the session ⋯ menu. Default: rename, duplicate, export, compact context, close. */
  sessionActions?: MenuItem[];
  onSessionAction?: (action: string, sessionId?: string) => void;
  /** Subagents of the active session, in the "Agentes" strip above the field. */
  agents?: ClaudeAgent[];
  /** Attachments already added to the next send. */
  attachments?: ClaudeAttachment[];
  /** Shows the paperclip and accepts files dragged into the field. */
  onUpload?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  /** Controlled or uncontrolled: without the value, the panel keeps the state. */
  mode?: ClaudeMode;
  onModeChange?: (mode: ClaudeMode) => void;
  model?: string;
  /** Default: Opus, Sonnet, Haiku. defaultEffort = what 'auto' uses (default 'high'); efforts = accepted levels (the others are disabled). */
  models?: { id: string; label: string; description?: string; defaultEffort?: Exclude<ClaudeEffort, 'auto'>; efforts?: Exclude<ClaudeEffort, 'auto'>[] }[];
  onModelChange?: (model: string) => void;
  effort?: ClaudeEffort;
  onEffortChange?: (effort: ClaudeEffort) => void;
  /** Voice dictation on (the consumer does the recognition and writes into the field). */
  listening?: boolean;
  onSpeakChange?: (listening: boolean) => void;
  className?: string;
}
export declare function ClaudePanel(props: ClaudePanelProps): React.ReactElement;

export type SyntaxKind = 'keyword' | 'function' | 'type' | 'string' | 'number' | 'constant' | 'property' | 'tag' | 'variable' | 'operator' | 'comment';
/** A token: plain text or [kind, text]. */
export type CodeToken = string | [SyntaxKind, string];
export interface CodeProps {
  lines: CodeToken[][];
  startLine?: number;
  /** Cursor line (absolute numbering). */
  activeLine?: number;
  /** Git marks per line (absolute numbering). */
  changes?: Record<number, 'added' | 'modified' | 'deleted'>;
  /** Code minimap on the right. Default: true. */
  minimap?: boolean;
  label?: string;
  className?: string;
}
export declare function Code(props: CodeProps): React.ReactElement;

export interface RecentWorkspace extends Workspace { lastOpened?: string }
export interface WelcomeProps {
  recent?: RecentWorkspace[];
  /** Always receives a list: one or more workspaces to open in the WorkspaceBar. */
  onOpen?: (ids: string[]) => void;
  onOpenFolder?: () => void;
  onClone?: () => void;
  onTerminal?: () => void;
  /** Creates a new workspace and hands the request to Claude Code. */
  onAsk?: (prompt: string) => void;
  tagline?: string;
  className?: string;
}
export declare function Welcome(props: WelcomeProps): React.ReactElement;

export interface NeonCardProps {
  /** 'live': neon line running around the border (AI working) · 'static': gradient ring · 'hover': runs only on hover. */
  trace?: 'static' | 'live' | 'hover';
  icon?: IconName;
  eyebrow?: string;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Diffuse shadow-neon glow under the card. */
  glow?: boolean;
  /** Makes the card clickable (role=button, lifts 2px on hover). */
  onClick?: () => void;
  as?: keyof JSX.IntrinsicElements;
  style?: React.CSSProperties;
  className?: string;
}
export declare function NeonCard(props: NeonCardProps): React.ReactElement;

export interface SidebarView {
  id: string;
  icon: IconName;
  /** View name: becomes the panel title, the aria-label and the tooltip. */
  label: string;
  shortcut?: string;
  /** Counter on the icon (e.g. pending changes in source control). */
  badge?: number;
  /** The view takes everything to the right of the column (e.g. Containers): the Sidebar shows only the icons and the consumer renders the screen. */
  takeover?: boolean;
}
export interface SidebarProps {
  /** Default: Explorador (files), Pesquisar (search), Controle de código (branch), Containers (box, takeover). */
  views?: SidebarView[];
  activeView?: string;
  onSelectView?: (id: string) => void;
  /** Shows the Settings gear at the bottom of the icon column. */
  onSettings?: () => void;
  /** Hides the view and leaves only the 44px column. */
  collapsed?: boolean;
  /** Clicking the already active icon collapses/expands the view (as in VS Code). */
  onToggleCollapse?: () => void;
  /** Replaces the active view title (e.g. "EXPLORER · BILLING-API"). */
  title?: string;
  /** Action buttons in the view header (use class "wp-x"). */
  actions?: React.ReactNode;
  /** Content of the active view: file tree, search, changes. */
  children?: React.ReactNode;
  width?: number | string;
  className?: string;
}
export declare function Sidebar(props: SidebarProps): React.ReactElement;

export interface ModalNavItem { id: string; label: string; icon?: IconName }
export interface ModalProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconName;
  /** 'danger' = destructive confirmation (alertdialog, icon and button in danger). */
  tone?: 'default' | 'danger';
  /** sm 420 · md 560 (default) · lg 800×560 (default when there is a nav). */
  size?: 'sm' | 'md' | 'lg';
  /** Section menu on the left (e.g. Settings). */
  nav?: ModalNavItem[];
  activeNav?: string;
  onNav?: (id: string) => void;
  children?: React.ReactNode;
  /** Text or node in the left corner of the footer (e.g. "Salvo automaticamente"). */
  footer?: React.ReactNode;
  primaryLabel?: string;
  primaryIcon?: IconName;
  onPrimary?: () => void;
  /** false keeps the modal open after the primary action. */
  closeOnPrimary?: boolean;
  secondaryLabel?: string;
  /** Default: closes the modal. */
  onSecondary?: () => void;
  /** Called when the exit animation ends: unmount the modal here. */
  onClose?: () => void;
  /** false: no "x", Esc and clicking outside do not close it (a choice is required). */
  dismissible?: boolean;
  /** Absolute overlay in the container instead of fixed to the window (documentation). */
  inline?: boolean;
  className?: string;
}
export declare function Modal(props: ModalProps): React.ReactElement;

export interface SettingRowProps { label: React.ReactNode; description?: React.ReactNode; badge?: string; children?: React.ReactNode; className?: string }
export declare function SettingRow(props: SettingRowProps): React.ReactElement;

export interface SwitchProps { checked?: boolean; onChange?: (checked: boolean) => void; label?: string; disabled?: boolean; id?: string; className?: string }
export declare function Switch(props: SwitchProps): React.ReactElement;

export type SelectOption = string | { value: string; label: string; description?: string; icon?: IconName; hint?: string; disabled?: boolean } | { header: string } | { divider: true };
export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  /** The event mimics the <select> one (target.value); the value also comes as the 2nd argument. */
  onChange?: (event: { target: { value: string; name?: string } }, value: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Renders a hidden input with this name, for forms. */
  name?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  style?: React.CSSProperties;
  className?: string;
}
export declare function Select(props: SelectProps): React.ReactElement;

export interface MenuItem {
  id?: string; label?: string; description?: string; icon?: IconName; shortcut?: string;
  /** Single-choice item: shows ✓ and becomes a menuitemradio. */
  checked?: boolean;
  danger?: boolean;
  divider?: boolean;
  /** Uppercase group title. */
  header?: string;
}
export interface MenuProps {
  open: boolean;
  onClose?: () => void;
  items?: MenuItem[];
  onSelect?: (id: string) => void;
  /** 'top-start' opens upward (field bar); 'bottom-end' opens downward, right-aligned (headers). */
  placement?: 'top-start' | 'bottom-end';
  /** The button that opened it: clicks on it do not close the menu, and focus returns to it on Esc. */
  anchorRef?: React.RefObject<HTMLElement>;
  closeOnSelect?: boolean;
  label?: string;
  /** Extra content after the items (e.g. the effort segmented control). */
  children?: React.ReactNode;
  className?: string;
}
export declare function Menu(props: MenuProps): React.ReactElement | null;

export type ContainerStatus = 'running' | 'restarting' | 'unhealthy' | 'exited' | 'paused' | 'created';
export interface DockerContainer {
  id: string; name: string; image: string; status: ContainerStatus;
  /** Text from docker ps: "Up 2 h (healthy)", "Exited (0) há 1 dia". */
  uptime?: string;
  cpu?: number; cpuHistory?: number[]; mem?: string; memPct?: number;
  ports?: { host: number; container: number; web?: boolean }[];
  command?: string; created?: string; network?: string; mounts?: string[]; envCount?: number;
  /** Explanation of the problem when unhealthy/restarting. */
  healthNote?: string;
}
export interface DockerProject { id: string; name: string; path?: string; containers: DockerContainer[] }
export interface ContainerLog { time: string; text: string; level?: 'info' | 'warn' | 'error' | 'debug' }
export interface ContainersViewProps {
  projects: DockerProject[];
  logs?: Record<string, ContainerLog[]>;
  context?: string; version?: string; engineUp?: boolean;
  memUsed?: string; memTotal?: string; memPct?: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onAction?: (action: 'start' | 'stop' | 'restart' | 'exec' | 'open-port', id: string) => void;
  onGroupAction?: (action: 'up' | 'restart' | 'stop', projectId: string) => void;
  onComposeUp?: () => void;
  onRefresh?: () => void;
  /** Shows "Investigar com o Claude" on containers with a problem. */
  onAskClaude?: (id: string) => void;
  className?: string;
}
export declare function ContainersView(props: ContainersViewProps): React.ReactElement;

export interface StatusBarProps {
  /** Project path on the computer ("~/code/clientes/billing-api"). */
  path?: string;
  /** Click on the path (e.g. open in Finder or copy). */
  onPath?: () => void;
  branch?: string;
  /** Commits to push / pull. Omitting both hides the sync item. */
  ahead?: number;
  behind?: number;
  /** Default: "origin/<branch>". */
  upstream?: string;
  /** Syncing: the arrows breathe. */
  syncing?: boolean;
  lastCommit?: { author: string; time?: string; message?: string; hash?: string };
  line?: number;
  column?: number;
  /** Selected characters. */
  selection?: number;
  /** "Espaços: 2". */
  indent?: string;
  encoding?: string;
  eol?: 'LF' | 'CRLF';
  language?: string;
  onBranch?: () => void; onSync?: () => void; onCommit?: () => void; onGoToLine?: () => void;
  onIndent?: () => void; onEncoding?: () => void; onEol?: () => void; onLanguage?: () => void;
  /** Extra items at the end of the left side / start of the right side (use the class "wp-stb-item"). */
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}
export declare function StatusBar(props: StatusBarProps): React.ReactElement;

export interface LogoProps {
  /** 'full' = symbol + "walph" (default) · 'symbol' = the W only. */
  variant?: 'full' | 'symbol';
  /** 'color' (gradient, default) · 'mono' (ink) · 'dark' (bg-000, for light backgrounds). */
  tone?: 'color' | 'mono' | 'dark';
  /** Height in px. Default 28. Minimums: 20 (full) and 16 (symbol). */
  size?: number;
  title?: string;
  style?: React.CSSProperties;
  className?: string;
}
export declare function Logo(props: LogoProps): React.ReactElement;

export interface FileIconProps {
  /** Name or path; the last segment is what counts. */
  name: string;
  kind?: 'file' | 'folder';
  open?: boolean;
  size?: number;
  /** Accessible name; without it the icon is decorative. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}
/** File theme icon: language tag, type glyph or category folder. */
export declare function FileIcon(props: FileIconProps): React.ReactElement;
export interface FileIconSpec { kind: 'file' | 'folder'; label?: string; glyph?: string | null; color: string; open?: boolean }
export declare function fileIconFor(name: string, opts?: { folder?: boolean; open?: boolean }): FileIconSpec;

declare global {
  interface Window {
    Walph: {
      WorkspaceBar: typeof WorkspaceBar; WorkspaceTab: typeof WorkspaceTab; Toast: typeof Toast;
      Button: typeof Button; Input: typeof Input; EditorTab: typeof EditorTab; TreeItem: typeof TreeItem;
      CommandPalette: typeof CommandPalette; Terminal: typeof Terminal; ClaudePanel: typeof ClaudePanel;
      Code: typeof Code; Welcome: typeof Welcome; NeonCard: typeof NeonCard; Sidebar: typeof Sidebar;
      Modal: typeof Modal; SettingRow: typeof SettingRow; Switch: typeof Switch; Select: typeof Select; Menu: typeof Menu; ContainersView: typeof ContainersView;
      EditorTabs: typeof EditorTabs; ClaudeQuestion: typeof ClaudeQuestion; StatusBar: typeof StatusBar; Logo: typeof Logo; FileIcon: typeof FileIcon; fileIconFor: typeof fileIconFor;
    };
  }
}
